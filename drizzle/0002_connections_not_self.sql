-- 自分自身を見守り者/受取人にするつながりを DB 単体でも拒否する（connections_party_ck と同じ二重防御）。
-- SQLite は既存表へ CHECK を足せず、表の作り直しは D1 で子表（concern_flags / message_recipients）が
-- cascade 削除されうるため、トリガーで同等の制約を掛ける。schema.ts には現れない点に注意。
CREATE TRIGGER `connections_not_self_insert` BEFORE INSERT ON `connections`
WHEN NEW.`other_user_id` = NEW.`subject_user_id`
BEGIN
	SELECT RAISE(ABORT, 'connections_not_self');
END;
--> statement-breakpoint
CREATE TRIGGER `connections_not_self_update` BEFORE UPDATE OF `subject_user_id`, `other_user_id` ON `connections`
WHEN NEW.`other_user_id` = NEW.`subject_user_id`
BEGIN
	SELECT RAISE(ABORT, 'connections_not_self');
END;
