"""OriSelf Next (v2.0) · 产品即 skill 的对话式人格测试框架。"""
from importlib.metadata import PackageNotFoundError, version as _pkg_version


def _resolve_version() -> str:
    """单一事实源 = server/pyproject.toml 的 [project].version。升级只改那一处。

    **优先直接读 pyproject.toml**，而不是读已安装包的 metadata——因为 editable
    安装（`pip install -e .`）的 metadata 只在安装时写一次，bump pyproject 后若不
    重装就会**永久过期**（v2.6.2→3.0.0 期间 /health 与网页页脚一直卡在 2.6.1 就是
    这个原因：源码树里残留的 oriself_server.egg-info 还是旧版本）。源码 / pm2 /
    Docker 部署下 pyproject.toml 都在场，直接读它永不过期、且无需每次发布重装。

    读不到 pyproject（极端打包场景）再退回已安装包 metadata，最后兜底 unknown。
    """
    try:
        import tomllib
        from pathlib import Path

        pyproject = Path(__file__).resolve().parent.parent / "pyproject.toml"
        with pyproject.open("rb") as fh:
            return str(tomllib.load(fh)["project"]["version"])
    except Exception:
        pass
    try:
        return _pkg_version("oriself-server")
    except PackageNotFoundError:
        return "0.0.0+unknown"


__version__ = _resolve_version()

__all__ = ["__version__"]
