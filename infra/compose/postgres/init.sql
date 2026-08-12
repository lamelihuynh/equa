-- Local development only. Production uses separate credentials and managed databases.
CREATE DATABASE equa_identity;
CREATE DATABASE equa_ledger;
CREATE DATABASE equa_platform;
CREATE DATABASE equa_notification;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
