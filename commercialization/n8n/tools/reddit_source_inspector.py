from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from urllib.parse import urlparse

SHARE_RE = re.compile(r"^/r/(?P<subreddit>[^/]+)/s/(?P<token>[A-Za-z0-9_-]+)/*$")
CANON_RE = re.compile(
    r"^/r/(?P<subreddit>[^/]+)/comments/(?P<post_id>[A-Za-z0-9]+)/(?P<slug>[^/?#]+)/*$"
)


@dataclass
class RedditTarget:
    source_url: str
    subreddit: str | None
    share_token: str | None
    post_id: str | None
    slug: str | None
    canonical_url: str | None
    state: str


def inspect_reddit_url(url: str) -> RedditTarget:
    parsed = urlparse(url.strip())
    host = parsed.netloc.lower()
    if host not in {"reddit.com", "www.reddit.com", "old.reddit.com"}:
        raise ValueError(f"unsupported host: {host or '<empty>'}")

    path = parsed.path.rstrip("/") or "/"

    share = SHARE_RE.match(path)
    if share:
        return RedditTarget(
            source_url=url,
            subreddit=share.group("subreddit"),
            share_token=share.group("token"),
            post_id=None,
            slug=None,
            canonical_url=None,
            state="SOURCE_IDENTITY_BLOCKED",
        )

    canonical = CANON_RE.match(path)
    if canonical:
        normalized = (
            "https://www.reddit.com/r/"
            f"{canonical.group('subreddit')}/comments/{canonical.group('post_id')}/"
            f"{canonical.group('slug')}/"
        )
        return RedditTarget(
            source_url=url,
            subreddit=canonical.group("subreddit"),
            share_token=None,
            post_id=canonical.group("post_id"),
            slug=canonical.group("slug"),
            canonical_url=normalized,
            state="SOURCE_IDENTITY_RESOLVED",
        )

    raise ValueError("unsupported Reddit URL shape")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Classify Reddit share/canonical URLs for the governed REA pipeline."
    )
    parser.add_argument("url")
    args = parser.parse_args()
    target = inspect_reddit_url(args.url)
    print(json.dumps(asdict(target), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
