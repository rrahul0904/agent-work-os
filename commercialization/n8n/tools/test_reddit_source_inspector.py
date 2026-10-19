import unittest

from reddit_source_inspector import inspect_reddit_url


class RedditSourceInspectorTests(unittest.TestCase):
    def test_short_share_is_blocked(self):
        target = inspect_reddit_url(
            "https://www.reddit.com/r/n8n_ai_agents/s/u61W83l1EV"
        )
        self.assertEqual(target.state, "SOURCE_IDENTITY_BLOCKED")
        self.assertEqual(target.subreddit, "n8n_ai_agents")
        self.assertEqual(target.share_token, "u61W83l1EV")
        self.assertIsNone(target.canonical_url)

    def test_canonical_post_is_resolved(self):
        target = inspect_reddit_url(
            "https://www.reddit.com/r/n8n_ai_agents/comments/abc123/example_title/"
        )
        self.assertEqual(target.state, "SOURCE_IDENTITY_RESOLVED")
        self.assertEqual(target.post_id, "abc123")
        self.assertEqual(
            target.canonical_url,
            "https://www.reddit.com/r/n8n_ai_agents/comments/abc123/example_title/",
        )

    def test_non_reddit_host_is_rejected(self):
        with self.assertRaises(ValueError):
            inspect_reddit_url("https://example.com/r/n8n_ai_agents/s/token")


if __name__ == "__main__":
    unittest.main()
