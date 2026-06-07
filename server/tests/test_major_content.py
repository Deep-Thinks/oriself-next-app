"""major 域 skill 文件加载契约。

本文件只测工程结构，不用词包断言 prompt 文案。
"""
from pathlib import Path

from oriself_server.skill_loader import clear_cache, load_skill_bundle

SKILL_ROOT = (
    Path(__file__).resolve().parent.parent.parent / "skill-repo" / "skills" / "oriself"
)


def setup_function(_):
    clear_cache()


def test_major_skill_files_load():
    bundle = load_skill_bundle(SKILL_ROOT)

    assert bundle.domain_md.get("major", "").strip()
    for key in (
        "major-onboarding",
        "major-warmup",
        "major-exploring",
        "major-midpoint",
        "major-deep",
        "major-soft-closing",
        "converge-major",
    ):
        ref = bundle.refs[key]
        assert ref.body.strip(), f"{key} body is empty"
