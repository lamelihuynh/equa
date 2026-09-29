-- Local development only. Production uses separate credentials and managed databases.
CREATE DATABASE equa_identity;
CREATE DATABASE equa_ledger;
CREATE DATABASE equa_platform;
CREATE DATABASE equa_notification;
CREATE DATABASE equa_automation_sync;
CREATE DATABASE equa_social;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
