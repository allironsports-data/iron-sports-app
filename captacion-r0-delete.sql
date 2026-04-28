-- DELETE all reports for clean reload
DELETE FROM scouting_reports;
SELECT COUNT(*) AS reports_after_delete FROM scouting_reports;
