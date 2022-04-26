const cc = DataStudioApp.createCommunityConnector();
const URL_PROPERTY_KEY = "dscc.path";
const AUTH_PROPERTY_KEY = "dscc.key";
const TABLE_PROPERTY_KEY = "table";
const TABLE_LIST_PROPERTY_KEY = "tableNames";
const CACHE_TTL_PROPERTY_KEY = "cache_ttl";
// const CACHED_TABLE_PROPERTY_KEY = "lastRequestTable";

// https://developers.google.com/datastudio/connector/reference#isadminuser
const isAdminUser = (): boolean => {
  return IS_ADMIN;
};

// https://developers.google.com/datastudio/connector/reference#getconfig
const getConfig = (request: GetConfigRequest): GetConfigResponse => {
  const configParams = request.configParams;
  const isFirstRequest = configParams === undefined;
  const isSecondRequest =
    !isFirstRequest && configParams.request_table !== undefined;
  const config = cc.getConfig();
  const user = PropertiesService.getUserProperties();

  if (isFirstRequest) {
    config.setIsSteppedConfig(true);
    user.setProperty(URL_PROPERTY_KEY, ODATA_ENDPOINT);
  }

  if (DEBUG) {
    Logger.log("isFirstRequest: " + isFirstRequest);
    Logger.log("isSecondRequest: " + isSecondRequest);
  }

  const user_key = user.getProperty(AUTH_PROPERTY_KEY);
  const service_url = user.getProperty(URL_PROPERTY_KEY);

  config
    .newCheckbox()
    .setId("reset_auth")
    .setName("Reset Auth?")
    .setHelpText("Do you want to reset Auth?")
    .setIsDynamic(true);

  // config
  //   .newTextInput()
  //   .setId("service_url")
  //   .setName("Enter url root path of OData services")
  //   .setIsDynamic(true);

  // If user logs out or authentication key are reset, throw an exception so they know to reset their page
  if (user_key === null) {
    resetAuth();
    cc.newUserError()
      .setText(
        "Your authentication have been reset. Please refresh your page to return to re-input authentication key."
      )
      .setDebugText("user_key: " + user_key)
      .throwException();
    return;
  }

  var validKey = validateCredentials(user_key, service_url); // Send test request to url with authentication key

  if (!validKey) {
    resetAuth();
    cc.newUserError()
      .setText("Invalid authentication key or url.")
      .throwException();
    return;
  }

  var tableOptions = getAvailableTablesFromUrl(service_url, user_key); // Return 2D array of table label and value
  var table = config
    .newSelectSingle()
    .setId("request_table")
    .setName("Table")
    .setIsDynamic(true);
  config.setIsSteppedConfig(true);
  tableOptions.forEach(function(tableName) {
    var tableLabel = tableName;
    var tableValue = tableName;
    table.addOption(
      config
        .newOptionBuilder()
        .setLabel(tableLabel)
        .setValue(tableValue)
    );
  });

  if (!isFirstRequest) {
    if (
      service_url === null ||
      user_key === null ||
      configParams.reset_auth === true
    ) {
      resetAuth();
      cc.newUserError()
        .setText(
          "Your authentication have been reset. Please refresh your page to return to re-input authentication key."
        )
        .setDebugText("URL: " + service_url + " ApiKey: " + user_key)
        .throwException();
      return;
    }

    config
      .newTextInput()
      .setId("cache_ttl")
      .setName("Cache TTL")
      .setHelpText(
        "Do you want to set how often data is refreshed? Minimum: 0, Maximum 60 minutes, default to 25."
      )
      .setPlaceholder(Math.trunc(DEFAULT_CACHE_DATA_TIMEOUT / 60).toString())
      .setAllowOverride(true);
  }

  // Save user requested table and set stepped config to false to move to the getData step.
  if (isSecondRequest) {
    let cache_ttl = DEFAULT_CACHE_DATA_TIMEOUT;

    if (configParams.cache_ttl) {
      cache_ttl = validateCacheTTLConfig(configParams.cache_ttl as string);
    }

    user.setProperty(CACHE_TTL_PROPERTY_KEY, cache_ttl.toString());
    user.setProperty(TABLE_PROPERTY_KEY, configParams.request_table as string);
    config.setIsSteppedConfig(false);
  }

  return config.build();
};

const getFields = (): Fields => {
  var fields = cc.getFields();

  var user = PropertiesService.getUserProperties();
  const path = user.getProperty(URL_PROPERTY_KEY);
  const key = user.getProperty(AUTH_PROPERTY_KEY);
  const table = user.getProperty(TABLE_PROPERTY_KEY);

  if (DEBUG) {
    Logger.log("User Requested Table in Get Fields: " + table);
  }

  // let rawXml = getEntitySchemaFromCache(table);

  // if (rawXml === null) {
  //   rawXml = getEntitySchema(table, key);
  // }
  const tablePropertiesMap = getEntitySchema(path, table, key); // Return key-value map of property name and Edm type.

  if (DEBUG) Logger.log("Parsed Properties: " + tablePropertiesMap);

  // Create field for each property with type
  Object.entries(tablePropertiesMap).forEach(([name, odataType]) => {
    var propertyType = getGDSType(odataType); // Get corresponding Google Data Studio type

    if (propertyType.conceptType === "metric") {
      fields
        .newMetric()
        .setId(name)
        .setName(name)
        .setType(propertyType.dataType);
    } else {
      fields
        .newDimension()
        .setId(name)
        .setName(name)
        .setType(propertyType.dataType);
    }
  });

  return fields;
};

// https://developers.google.com/datastudio/connector/reference#getschema
const getSchema = (request: GetSchemaRequest): GetSchemaResponse => {
  return { schema: getFields().build() };
};

// https://developers.google.com/datastudio/connector/reference#getdata
const getData = (request: GetDataRequest): GetDataResponse => {
  var user = PropertiesService.getUserProperties();
  const path = user.getProperty(URL_PROPERTY_KEY);
  const key = user.getProperty(AUTH_PROPERTY_KEY);
  const table = user.getProperty(TABLE_PROPERTY_KEY);

  var cache_ttl_prop = parseInt(user.getProperty(CACHE_TTL_PROPERTY_KEY));
  cache_ttl_prop = Number.isInteger(cache_ttl_prop)
    ? cache_ttl_prop
    : DEFAULT_CACHE_DATA_TIMEOUT;

  var cache_ttl_config = validateCacheTTLConfig(
    request.configParams.cache_ttl as string
  );

  var cache_ttl = Number.isInteger(cache_ttl_config)
    ? cache_ttl_config
    : cache_ttl_prop; // Override cache ttl changes from config

  // Ensure that this value will not be null in getEntityDataFromCache
  if (cache_ttl !== cache_ttl_prop) {
    cache_ttl = cache_ttl * 60;
    user.setProperty(CACHE_TTL_PROPERTY_KEY, cache_ttl.toString());

    if (DEBUG) {
      Logger.log("Set cache_ttl: " + cache_ttl);
    }
  }

  var responseRows = null;

  if (DEBUG) {
    Logger.log("we are in getData() function.");
    Logger.log("request parameter within getData() is:");
    Logger.log(request);
    Logger.log("Path: " + path);
    Logger.log("Key: " + key);
    Logger.log("RequestedTable: " + table);
  }

  var requestedFields = getFields().forIds(
    request.fields.map(function(field) {
      return field.name;
    })
  );

  //responseRows = getEntityDataFromCache(table); // Retrieves row of entity data from cache, null if no cached data
  responseRows = getEntityData(path, table, key); // Make request to url on table with authentication key

  // if (responseRows === null) {
  //   if (DEBUG) {
  //     Logger.log("No cached data for table: " + table);
  //   }

  //   responseRows = getEntityData(path, table, key); // Make request to url on table with authentication key
  // } else if (DEBUG) {
  //   Logger.log("Get data from cache");
  // }

  // if (DEBUG) {
  //   Logger.log("Raw Json Response");
  //   Logger.log(responseRows);
  // }
  var rows = parseOdataResponseToRow(requestedFields, responseRows); // Parse raw response to array of row

  if (DEBUG) {
    Logger.log("requestedFields are");
    let debugRequestedFields = requestedFields.asArray();
    debugRequestedFields.map(function(field) {
      Logger.log(field.getId());
      Logger.log(field.getType());
    });

    Logger.log(rows.length);
    if (rows.length) {
      Logger.log("First Row: ");
      Logger.log(rows[0].values);
    }
  }

  return {
    schema: requestedFields.build(),
    rows: rows,
  };
};
