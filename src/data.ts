var metaDataMap = new Map(); // Map for keeping track of meta data types to parse paths in the schema correctly
const UNIQUE_SEPARATOR = ",";
const VENIO_EDM_SCHEMA_NS = "Venio.OData.API.Models";
const VENIO_ENTITY_SCHEMA_NS = "Default";
const MAX_CACHE_BYTES = 100000; // Max cached size per key

const getAvailableTablesFromUrl = (url: string, key: string): string[] => {
  // get another response based on the new token
  var user = PropertiesService.getUserProperties();
  var response;

  try {
    response = UrlFetchApp.fetch(url, {
      method: "get",
      headers: {
        ApiKey: key,
      },
      muteHttpExceptions: true,
    });
  } catch (error) {
    if (debug) {
      Logger.log("Get Table Error: " + error);
      Logger.log("Url: " + url);
      Logger.log("Key: " + key);
    }

    cc.newUserError()
      .setText("You have entered an invalid URL.")
      .setDebugText(
        "User has entered an invalid URL. API request to get table names failed.\nYou are connected to server: " +
          url +
          "\nMake sure that you are only accessing forms from that server and that your form path is correct."
      )
      .throwException();
  }

  if (response.getResponseCode() !== 200) {
    cc.newUserError()
      .setText("You have entered an invalid URL.")
      .setDebugText(
        "User has entered an invalid URL. API request to get table names failed.\nYou are connected to server: " +
          url +
          "\nMake sure that you are only accessing forms from that server and that your form path is correct."
      )
      .throwException();
  }

  var responseJson;
  try {
    responseJson = JSON.parse(response);
  } catch (error) {
    cc.newUserError()
      .setText("bad URL request, please enter the correct URL to your data")
      .setDebugText(
        "User has entered an invalid URL. API request to get table names failed.\nYou are connected to server: " +
          url +
          "\nMake sure that you are only accessing forms from that server and that your form path is correct."
      )
      .throwException();
  }

  /** json looks like following:
    {
      "@odata.context": "https://sandbox.getodk.cloud/v1/projects/4/forms/groups%20schema.svc/$metadata",
      "value": [{
          "name": "Submissions",
          "kind": "EntitySet",
          "url": "Submissions"
      }]
    }
    **/
  var tableNames = [];

  for (const table_info of responseJson["value"]) {
    tableNames.push(table_info["name"]);
  }
  user.setProperty(TABLE_LIST_PROPERTY_KEY, tableNames.join(UNIQUE_SEPARATOR));
  return tableNames;
};

/**
 * This method returns an object that has two fields that indicate the Google
 * data studio concept type and data type of this type from Odata passed in
 * as a parameter.
 *
 * documentaion of data types from odata world: https://getodk.github.io/xforms-spec/#data-types
 * documentation of data types for Google data studio: https://developers.google.com/datastudio/connector/reference#field
 *
 * if this type from Odata is currently unrecognized or doesn't have
 * a correspondence in google data studio, the default is to return
 * {'conceptType': 'dimension', 'dataType': types.TEXT}
 *
 * @param {String} OdataType a string that represents a type in odata. Example: "int", "string"
 * @return {object} example: {'conceptType': 'dimension'/'metric', 'dataType': types.BOOLEAN}
 */
const getGDSType = (odataType: string): GetDataStudioType => {
  var types = cc.FieldType;

  switch (odataType) {
    case "Edm.Int32":
      return { conceptType: "metric", dataType: types.NUMBER };
    case "Edm.Int64":
      return { conceptType: "metric", dataType: types.NUMBER };
    case "Edm.String":
      return { conceptType: "dimension", dataType: types.TEXT };
    case "Edm.Boolean":
      return { conceptType: "metric", dataType: types.BOOLEAN };
    case "Edm.Decimal":
      return { conceptType: "metric", dataType: types.NUMBER };
    case "Edm.Date":
      // GDS format: "20170317"
      // Odata format: "2017-03-17"
      // need conversion later when parsing data.
      return { conceptType: "dimension", dataType: types.YEAR_MONTH_DAY };
    case "Edm.Time":
      // odata format: "12-00 (noon)"
      // no corresponding data type in GDS. GDS has hours and minutes as separate data types
      // storing time as text for now to avoid losing any data
      return { conceptType: "dimension", dataType: types.TEXT };
    case "Edm.DateTime":
      // GDS format: "2017031720"
      // Odata format: "2017-03-17T20:00"
      // need conversion later when parsing data.
      return { conceptType: "dimension", dataType: types.YEAR_MONTH_DAY_HOUR };
    case "Edm.DateTimeOffset":
      // GDS format: "2017031720"
      // Odata format: "2017-03-17T20:00:00Z"
      // need conversion later when parsing data.
      return { conceptType: "dimension", dataType: types.YEAR_MONTH_DAY_HOUR };
  }

  return { conceptType: "dimension", dataType: types.TEXT };
};

const getEntitySchema = (
  url: string,
  entity: string,
  key: string
): ParsedODataSchema => {
  var response, rawXml;

  var URLs = [url, "/", "$metadata"];
  try {
    response = UrlFetchApp.fetch(URLs.join(""), {
      method: "get",
      headers: {
        ApiKey: key,
      },
      muteHttpExceptions: true,
    });
    rawXml = response.getContentText();
  } catch (error) {
    cc.newUserError()
      .setText("You have entered an invalid URL.")
      .setDebugText(
        "User has entered an invalid URL. API request to get table names failed.\nYou are connected to server: " +
          url +
          "\nMake sure that you are only accessing forms from that server and that your form path is correct."
      )
      .throwException();
  }

  if (response.getResponseCode() !== 200) {
    cc.newUserError()
      .setText("wrong response status code.")
      .setDebugText("wrong response status code.")
      .throwException();
  }

  return parseSchemaXml(rawXml, entity);
};

const getEntityData = (url: string, entity: string, key: string): string => {
  var response, rawJson;

  var URLs = [url, "/", entity];
  try {
    response = UrlFetchApp.fetch(URLs.join(""), {
      method: "get",
      headers: {
        ApiKey: key,
      },
      muteHttpExceptions: true,
    });
    rawJson = response.getContentText();
  } catch (error) {
    cc.newUserError()
      .setText("You have entered an invalid URL.")
      .setDebugText(
        "User has entered an invalid URL. API request to get table names failed.\nYou are connected to server: " +
          url +
          "\nMake sure that you are only accessing forms from that server and that your form path is correct."
      )
      .throwException();
  }

  if (response.getResponseCode() !== 200) {
    cc.newUserError()
      .setText("wrong response status code.")
      .setDebugText("wrong response status code.")
      .throwException();
  }

  var parsedValue = null;

  try {
    parsedValue = JSON.parse(rawJson).value;
  } catch (error) {
    cc.newUserError()
      .setText("Invalid response from server.")
      .setDebugText("Error parsing response to json: " + error)
      .throwException();
  }

  if (parsedValue === null) {
    cc.newUserError()
      .setText("Empty response from server")
      .setDebugText("Null JSON response from server.")
      .throwException();
  }

  putEntityDataToCache(entity, parsedValue);

  return parsedValue;
};

const getEntityDataFromCache = (entity: string): ODataResponseRows | null => {
  var cache = CacheService.getUserCache();
  var cachedKeys = cache.get(entity);

  if (cachedKeys === null) return null;

  var cachedKeysArray = cachedKeys.split(UNIQUE_SEPARATOR);
  var shardedData = cache.getAll(cachedKeysArray);

  // TODO: Assemble all cached data
  const rows = [];
  Object.values(shardedData).forEach((rawJson) => {
    let dataRows = JSON.parse(rawJson);
    dataRows.forEach((row) => rows.push(row));
  });
  //var cachedData = Object.values(shardedData).join("")

  return rows;
};

const putEntityDataToCache = (entity: string, rawData: ODataResponseRows) => {
  const user = PropertiesService.getUserProperties();
  let cache_ttl = parseInt(user.getProperty(CACHE_TTL_PROPERTY_KEY));
  cache_ttl = Number.isInteger(cache_ttl) ? cache_ttl : CACHE_DATA_TIMEOUT; // Probably unnecessary as it was set in get data anyway
  const cache = CacheService.getUserCache();
  var cachedDataKeys;
  var cachedData;

  // Distribute and cached all data
  try {
    cachedData = chunkRowByBytes(rawData, MAX_CACHE_BYTES);
  } catch (error) {
    Logger.log("Error while chunking bytes: " + error);
    return;
  }

  // Combine all sharded cache keys and join with UNIQUE_SEPARATOR
  cachedDataKeys = Object.keys(cachedData).join(UNIQUE_SEPARATOR);

  // Save all cached data
  cache.put(entity, cachedDataKeys, cache_ttl);
  cache.putAll(cachedData, cache_ttl);
};
