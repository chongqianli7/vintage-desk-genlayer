# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from genlayer import *

QUARTERS = ("first", "second", "third", "fourth")
EDITIONS = ("advance", "second", "third")
DOMAIN = "https://www.bea.gov/news/"


def observation(path: str, year: int, quarter: int) -> str:
    response = gl.nondet.web.request(DOMAIN + path, method="GET")
    if response.status_code == 404:
        return "NOT_FOUND"
    if response.status_code != 200:
        raise gl.UserError("Source unavailable; retry")
    raw = response.body.decode("utf-8")
    statement = re.search(
        r"Real gross domestic product\s*\(GDP\)\s+(increased|decreased)\s+at an annual rate of\s+(\d{1,2}(?:\.\d{1,2})?)\s+percent in the\s+(first|second|third|fourth) quarter of (\d{4})",
        raw, re.IGNORECASE,
    )
    if statement is None:
        return "MISSING_OBSERVATION"
    direction, amount, reported_quarter, reported_year = statement.groups()
    if reported_quarter.lower() != QUARTERS[quarter - 1] or int(reported_year) != year:
        return "WRONG_PERIOD"
    whole, _, fraction = amount.partition(".")
    value = int(whole) * 100 + int(fraction.ljust(2, "0"))
    return str(-value if direction.lower() == "decreased" else value)


@allow_storage
@dataclass
class Market:
    organizer: Address
    year: u256
    quarter: u256
    edition: str
    path: str
    lower: i256
    upper: i256
    close_time: u256
    replay: bool
    status: str
    evidence: str
    result: i256
    outcome: u256
    entries: str
    attempts: u256


class VintageDesk(gl.Contract):
    total: u256
    markets: TreeMap[u256, Market]

    def __init__(self):
        self.total = u256(0)

    @gl.public.write
    def open_market(self, year: u256, quarter: u256, edition: str, path: str,
                    lower: i256, upper: i256, close_time: u256, replay: bool):
        year, quarter = int(year), int(quarter)
        now = int(datetime.fromisoformat(gl.message_raw["datetime"]).timestamp())
        if not 2020 <= year <= 2100 or not 1 <= quarter <= 4 or edition not in EDITIONS:
            raise gl.UserError("Invalid release terms")
        if not -2000 <= lower < upper <= 2000:
            raise gl.UserError("Invalid growth bands")
        # A fixed host and checked edition prevent arbitrary oracle requests.
        pattern = r"\d{4}/gross-domestic-product-(?:(?:us-)?(?:first|second|third|fourth)-quarter-\d{4}|\d{4}-q[1-4])-" + edition + r"-estimate(?:-[a-z0-9-]+)?"
        if len(path) > 180 or re.fullmatch(pattern, path) is None:
            raise gl.UserError("Use a BEA GDP release path matching the edition")
        quarter_end_month = quarter * 3 + 1
        release_year = year + (1 if quarter_end_month == 13 else 0)
        release_month = 1 if quarter_end_month == 13 else quarter_end_month
        earliest_release = int(datetime(release_year, release_month, 1, tzinfo=timezone.utc).timestamp())
        if replay:
            if now < earliest_release or close_time != 0:
                raise gl.UserError("Replay requires a past quarter and manual close")
        elif not now < close_time <= earliest_release:
            raise gl.UserError("Live forecasts must close no later than quarter-end")
        self.total = u256(self.total + 1)
        self.markets[self.total] = Market(
            gl.message.sender_address, u256(year), u256(quarter), edition, path,
            i256(lower), i256(upper), u256(close_time), replay, "OPEN", "", i256(0),
            u256(0), "[]", u256(0),
        )

    @gl.public.write
    def forecast(self, market_id: u256, low: u256, middle: u256, high: u256):
        market = self.markets[market_id]
        now = int(datetime.fromisoformat(gl.message_raw["datetime"]).timestamp())
        if market.status != "OPEN" or (not market.replay and now >= market.close_time):
            raise gl.UserError("Forecast window closed")
        if max(low, middle, high) > 100 or low + middle + high != 100:
            raise gl.UserError("Assign exactly 100 probability points")
        entries = json.loads(market.entries)
        sender = str(gl.message.sender_address).lower()
        if len(entries) >= 30 or any(entry[0] == sender for entry in entries):
            raise gl.UserError("Wallet already recorded or market full")
        entries.append([sender, int(low), int(middle), int(high)])
        market.entries = json.dumps(entries)

    @gl.public.write
    def freeze(self, market_id: u256):
        m = self.markets[market_id]
        if m.status != "OPEN":
            raise gl.UserError("Market is already closed")
        if m.replay and gl.message.sender_address != m.organizer:
            raise gl.UserError("Only organizer can freeze a replay")
        if not m.replay and int(datetime.fromisoformat(gl.message_raw["datetime"]).timestamp()) < m.close_time:
            raise gl.UserError("Live close time has not arrived")
        m.status = "FROZEN"

    @gl.public.write
    def settle(self, market_id: u256):
        m = self.markets[market_id]
        if m.status not in ("FROZEN", "SOURCE_PENDING"):
            raise gl.UserError("Freeze market before settlement")
        path, year, quarter = m.path, int(m.year), int(m.quarter)
        def fetch_observation() -> str:
            return observation(path, year, quarter)
        evidence = gl.eq_principle.strict_eq(fetch_observation)
        m.attempts = u256(m.attempts + 1)
        m.evidence = evidence
        if evidence in ("NOT_FOUND", "WRONG_PERIOD", "MISSING_OBSERVATION"):
            m.status = "SOURCE_PENDING"
            return
        value = int(evidence)
        outcome = 0 if value < m.lower else (1 if value < m.upper else 2)
        entries = json.loads(m.entries)
        for entry in entries:
            loss = sum((p - (100 if i == outcome else 0)) ** 2 for i, p in enumerate(entry[1:]))
            entry.append(20000 - loss)
        m.entries = json.dumps(entries)
        m.result = i256(value)
        m.outcome = u256(outcome)
        m.status = "SETTLED"

    @gl.public.view
    def count(self) -> u256:
        return self.total

    @gl.public.view
    def get_market(self, market_id: u256) -> dict:
        m = self.markets[market_id]
        return {"organizer": m.organizer, "year": m.year, "quarter": m.quarter, "edition": m.edition,
                "path": m.path, "lower": m.lower, "upper": m.upper, "close_time": m.close_time,
                "replay": m.replay, "status": m.status, "evidence": m.evidence, "result": m.result,
                "outcome": m.outcome, "entries": m.entries, "attempts": m.attempts}
