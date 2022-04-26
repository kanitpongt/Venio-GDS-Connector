// Temporary constant to prevent error on local development, variables are injected in development and production
const DEBUG = true; // Will log data
const IS_ADMIN = true; // Will log stack trace
const DEFAULT_CACHE_DATA_TIMEOUT = 1500; // In seconds = 25 minutes
const VENIO_EDM_SCHEMA_NS = "Venio.OData.API.Models"; // Entity's edm namespace in OData xml schema
const VENIO_ENTITY_SCHEMA_NS = "Default"; // Entity namespace that list Entity's edm name
const MAX_CACHE_BYTES = 100000; // Max cached size per key, 100KB
const ODATA_ENDPOINT = ""