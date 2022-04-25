var metaDataMap = new Map(); // Map for keeping track of meta data types to parse paths in the schema correctly
const UNIQUE_SEPARATOR = ",";
const ROW_SIZE_MULTIPLIER = 1.5;

function getAvailableTablesFromUrl(url: string, key: string): string[] {
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
    if (DEBUG) {
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
}

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

const getEntityData = (
  url: string,
  entity: string,
  key: string
): ODataResponseRows => {
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

  var responseRows: ODataResponseRows;

  try {
    let jsonResponse = JSON.parse(rawJson);
    responseRows = jsonResponse.value;
  } catch (error) {
    cc.newUserError()
      .setText("Invalid response from server.")
      .setDebugText("Error parsing response to json: " + error)
      .throwException();
  }

  if (responseRows === null || responseRows.length === 0) {
    cc.newUserError()
      .setText("Empty response from server")
      .setDebugText("Null JSON or empty rows response from server.")
      .throwException();
  }

  putEntityDataToCache(entity, responseRows);

  return responseRows;
};

const getEntityDataFromCache = (entity: string): ODataResponseRows | null => {
  const cache = CacheService.getUserCache();
  const cachedDataKeys = cache.get(entity);

  if (DEBUG) {
    Logger.log("Get cached data keys: " + cachedDataKeys);
  }
  if (cachedDataKeys === null) return null;

  const cachedKeysArray = cachedDataKeys.split(UNIQUE_SEPARATOR);
  const shardedData = cache.getAll(cachedKeysArray);

  // Assemble all cached data
  const rows = [];
  Object.values(shardedData).forEach((rawJson) => {
    let dataRows = JSON.parse(rawJson);
    dataRows.forEach((row) => rows.push(row));
  });

  return rows;
};

const putEntityDataToCache = (entity: string, rawData: ODataResponseRows) => {
  const user = PropertiesService.getUserProperties();
  let cache_ttl = parseInt(user.getProperty(CACHE_TTL_PROPERTY_KEY));
  cache_ttl = Number.isInteger(cache_ttl)
    ? cache_ttl
    : DEFAULT_CACHE_DATA_TIMEOUT; // Probably unnecessary as it was set in get data anyway
  const cache = CacheService.getUserCache();
  let cachedData;

  // Distribute and cached all data
  try {
    cachedData = chunkRowByBytes(rawData, MAX_CACHE_BYTES); // Cache data by rows
  } catch (error) {
    Logger.log("Error while chunking bytes: " + error);
    return;
  }
  // Combine all sharded cache keys and join with UNIQUE_SEPARATOR
  const cachedDataKeys = Object.keys(cachedData);
  const cachedKeyString = cachedDataKeys.join(UNIQUE_SEPARATOR);

  //cachedData[entity] = cachedKeyString;

  // Save all cached data
  cache.put(entity, cachedKeyString, cache_ttl);
  cache.putAll(cachedData, cache_ttl);

  if (DEBUG) {
    Logger.log(
      "Put cached data keys " +
        entity +
        ", " +
        cache_ttl +
        ":" +
        cache.get(entity)
    );
  }
};
