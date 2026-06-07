"""前端对话页契约 · 防止半程误收信。"""
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent.parent


def test_manual_converge_requires_late_journey_helper():
    helper = (ROOT / "web" / "lib" / "converge.ts").read_text(encoding="utf-8")
    api = (ROOT / "web" / "lib" / "api.ts").read_text(encoding="utf-8")
    view = (
        ROOT / "web" / "app" / "letters" / "[id]" / "letter-view.tsx"
    ).read_text(encoding="utf-8")

    assert "MANUAL_CONVERGE_MIN_PROGRESS = 0.78" in helper
    assert "lastStatus === \"CONVERGE\"" in helper
    assert "progress >= MANUAL_CONVERGE_MIN_PROGRESS" in helper
    assert "canShowManualConvergeAction" in view
    assert "现在收信" in view
    assert "先到这里" in view
    assert "currentRound >= 6 && !isCompleted" not in view
    assert "还没聊到可以收信" in api
