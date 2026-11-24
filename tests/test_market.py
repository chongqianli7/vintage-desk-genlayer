"""Local parser and transition tests using a stub SDK."""
import importlib.util
import json
import sys
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace

sdk = ModuleType("genlayer")
sdk.Address = str
sdk.u256 = sdk.i256 = int
sdk.TreeMap = dict
sdk.allow_storage = lambda value: value
sdk.gl = SimpleNamespace(
    Contract=object, UserError=ValueError,
    public=SimpleNamespace(write=lambda method: method, view=lambda method: method),
    message=SimpleNamespace(sender_address="host"),
    message_raw={"datetime": "2026-11-24T12:00:00Z"},
    nondet=SimpleNamespace(web=SimpleNamespace()),
    eq_principle=SimpleNamespace(strict_eq=lambda run: run()),
)
spec = importlib.util.spec_from_file_location(
    "vintage_contract", Path(__file__).resolve().parents[1] / "contracts/vintage_desk.py"
)
contract = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = contract
actual_sdk = sys.modules.get("genlayer")
sys.modules["genlayer"] = sdk
try:
    spec.loader.exec_module(contract)
finally:
    if actual_sdk is None:
        del sys.modules["genlayer"]
    else:
        sys.modules["genlayer"] = actual_sdk


class MarketTests(unittest.TestCase):
    release = "2024/gross-domestic-product-third-quarter-2024-advance-estimate"
    headline = "Real gross domestic product (GDP) increased at an annual rate of 2.8 percent in the third quarter of 2024"

    def setUp(self):
        sdk.gl.message.sender_address = "host"
        sdk.gl.eq_principle.strict_eq = lambda run: run()
        self.offer(200, self.headline)
        self.desk = contract.VintageDesk()
        self.desk.markets = {}
        self.desk.open_market(2024, 3, "advance", self.release, 200, 300, 0, True)

    def offer(self, status, body):
        sdk.gl.nondet.web.request = lambda *args, **kwargs: SimpleNamespace(status=status, body=body.encode())

    def test_scores_and_replays(self):
        self.desk.forecast(1, 10, 75, 15)
        with self.assertRaises(ValueError):
            self.desk.forecast(1, 10, 75, 15)
        self.desk.freeze(1)
        self.desk.settle(1)
        market = self.desk.get_market(1)
        self.assertEqual((market["status"], market["result"], market["outcome"]), ("SETTLED", 280, 1))
        self.assertEqual(json.loads(market["entries"])[0][-1], 19050)
        with self.assertRaises(ValueError):
            self.desk.settle(1)

    def test_missing_then_recover(self):
        self.desk.freeze(1)
        self.offer(404, "")
        self.desk.settle(1)
        self.assertEqual(self.desk.get_market(1)["evidence"], "NOT_FOUND")
        self.offer(200, "<html>No GDP release</html>")
        self.desk.settle(1)
        self.assertEqual(self.desk.get_market(1)["evidence"], "MISSING_OBSERVATION")
        self.offer(200, self.headline)
        self.desk.settle(1)
        self.assertEqual(self.desk.get_market(1)["status"], "SETTLED")

    def test_unavailability_or_disagreement_preserves_freeze(self):
        self.desk.freeze(1)
        self.offer(503, "")
        with self.assertRaises(ValueError):
            self.desk.settle(1)
        self.assertEqual(self.desk.get_market(1)["attempts"], 0)
        sdk.gl.eq_principle.strict_eq = lambda _: self.fail_consensus()
        with self.assertRaises(RuntimeError):
            self.desk.settle(1)
        self.assertEqual(self.desk.get_market(1)["status"], "FROZEN")

    def test_wrong_quarter_and_clock_bounds(self):
        self.desk.freeze(1)
        self.offer(200, self.headline.replace("third", "second"))
        self.desk.settle(1)
        self.assertEqual(self.desk.get_market(1)["evidence"], "WRONG_PERIOD")
        with self.assertRaises(ValueError):
            self.desk.open_market(2024, 3, "advance", self.release, 200, 300, 1, False)

    @staticmethod
    def fail_consensus():
        raise RuntimeError("Simulated validator disagreement")


if __name__ == "__main__":
    unittest.main()
