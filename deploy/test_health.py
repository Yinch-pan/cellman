import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('health', pathlib.Path(__file__).with_name('cellman-health.py'))
health = importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)


class Notifications(unittest.TestCase):
    def test_healthy_first_check_is_quiet(self):
        self.assertFalse(health.notification_due([], {}, 100000))

    def test_problem_and_recovery(self):
        self.assertTrue(health.notification_due(['down'], {}, 100000))
        self.assertTrue(health.notification_due([], {'notifiedWarnings': ['down'], 'lastAlertAttemptAt': 90000}, 100000))

    def test_unchanged_is_quiet_until_reminder(self):
        previous = {'notifiedWarnings': ['down'], 'lastNotifiedAt': 100000, 'lastAlertAttemptAt': 100000}
        self.assertFalse(health.notification_due(['down'], previous, 101000))
        self.assertTrue(health.notification_due(['down'], previous, 122000))

    def test_retry_is_bounded_and_recovers_without_false_message(self):
        previous = {'lastAlertAttemptAt': 100000}
        self.assertFalse(health.notification_due(['down'], previous, 100100))
        self.assertTrue(health.notification_due(['down'], previous, 101000))
        self.assertFalse(health.notification_due([], previous, 101000))


if __name__ == '__main__':
    unittest.main()
