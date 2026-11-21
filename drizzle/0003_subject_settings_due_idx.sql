DROP INDEX `subject_settings_scan_idx`;--> statement-breakpoint
CREATE INDEX `subject_settings_due_idx` ON `subject_settings` (`state`,"last_signal_at" + ("detection_window_hours" * 3600));