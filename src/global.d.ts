// TODO - all of the `Object` types could probably be better specified in the
// future, but since that's what the builder's `.build()` return, this is the
// best we can do for now.

// getAuthType
type GetAuthTypeResponse = Object;

type Fields = GoogleAppsScript.Data_Studio.Fields;
type FieldType = GoogleAppsScript.Data_Studio.FieldType;

// getSchema
interface GetSchemaRequest {
  configParams: ConfigParams;
}
interface GetSchemaResponse {
  schema: Object[];
}

// getConfig
interface GetConfigRequest {
  languageCode: string;
  configParams?: ConfigParams;
}
type GetConfigResponse = Object;

// getData
interface ConfigParams {
  [configId: string]: string | boolean;
}
interface GetDataRequest {
  configParams?: ConfigParams;
  scriptParams: {
    sampleExtraction: boolean;
    lastRefresh: string;
  };
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  fields: Array<{
    name: string;
  }>;
}

type GetDataRowValue = string | number | boolean;
interface GetDataRow {
  values: Array<GetDataRowValue>;
}
type GetDataRows = Array<GetDataRow>;

interface GetDataResponse {
  schema: Object[];
  rows: GetDataRows;
}

// setCredentials
interface UserPassCredentials {
  userPass: {
    username: string;
    password: string;
  };
}

interface UserTokenCredentials {
  userToken: {
    username: string;
    token: string;
  };
}

interface KeyCredentials {
  key: string;
}

type SetCredentialsRequest =
  | UserPassCredentials
  | UserTokenCredentials
  | KeyCredentials;

interface SetCredentialsResponse {
  errorCode: "NONE" | "INVALID_CREDENTIALS";
}

interface GetDataStudioType {
  conceptType: "dimension" | "metric";
  dataType: FieldType;
}

interface ParsedODataSchema {
  [propertyName: string]: string;
}

interface ODataRow {
  [propertyName: string]: any;
}

type ODataResponseRows = Array<ODataRow>;