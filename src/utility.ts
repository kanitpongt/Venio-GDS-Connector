const throwObject = (s: any) => {
  cc.newDebugError()
    .setText(JSON.stringify(s))
    .throwException();
};

const logObject = (s: any) => {
  Logger.log(JSON.stringify(s));
};

const parseSchemaXml = (
  rawXml: string,
  entityName: string
): ParsedODataSchema => {
  let document = XmlService.parse(rawXml);
  let root = document.getRootElement();

  let dataServices = root.getChild("DataServices", root.getNamespace());

  if (DEBUG) Logger.log("DataServices: " + dataServices);

  let serviceSchemas = dataServices.getChildren();
  var venioEdmSchema = null; // Contains mapping of Edm model name and its schema
  var venioEntitySchema = null; // Contains mapping of EntitySet and its Edm model name

  for (var i = 0; i < serviceSchemas.length; i++) {
    var schema = serviceSchemas[i];
    if (schema.getAttribute("Namespace").getValue() === VENIO_EDM_SCHEMA_NS) {
      venioEdmSchema = schema;
    } else if (
      schema.getAttribute("Namespace").getValue() === VENIO_ENTITY_SCHEMA_NS
    ) {
      venioEntitySchema = schema;
    }
  }

  if (venioEntitySchema === null) {
    cc.newUserError()
      .setText("Unable to find Venio's entity schema from url")
      .setDebugText(
        "Unable to find " + VENIO_ENTITY_SCHEMA_NS + " entity schema from url."
      )
      .throwException();
  } else if (venioEdmSchema === null) {
    cc.newUserError()
      .setText("Unable to find Venio's edm schema from url")
      .setDebugText(
        "Unable to find " + VENIO_EDM_SCHEMA_NS + " edm schema from url"
      )
      .throwException();
  }

  var venioEntityModels = venioEntitySchema.getChildren()[0].getChildren();
  var venioEdmModels = venioEdmSchema.getChildren();
  var requestedEntityType = null;
  var entityTypeName = null;

  if (DEBUG) {
    Logger.log(venioEntityModels);
  }
  // Search for the name of EntityType for the user selected entity (table).
  for (var i = 0; i < venioEntityModels.length; i++) {
    var entitySet = venioEntityModels[i];
    var enitySetName = entitySet.getAttribute("Name").getValue();

    if (DEBUG) {
      Logger.log("Entity Set: " + enitySetName);
    }

    if (enitySetName == entityName) {
      entityType = entitySet.getAttribute("EntityType").getValue();
      entityType = entityType.replace(VENIO_EDM_SCHEMA_NS, ""); // Remove "Venio.OData.API.Models" from EntityType name
      entityTypeName = entityType.replace(".", ""); // Remove trailing period from ".{EntityTypeName}"
    }
  }

  // EntityName not found in schema
  if (entityTypeName === null) {
    cc.newUserError()
      .setText("Unable to find " + entityName + " in schema.")
      .setDebugText(
        "Unable to find " +
          entityName +
          " edm type name in " +
          VENIO_ENTITY_SCHEMA_NS +
          " schema."
      )
      .throwException();
  }

  // Find EntityType from {VENIO_EDM_SCEMA_NS} schema
  for (var i = 0; i < venioEdmModels.length; i++) {
    var entityType = venioEdmModels[i];

    if (entityType.getAttribute("Name").getValue() === entityTypeName) {
      requestedEntityType = entityType;
    }
  }

  // Handle EntityType not found.
  if (requestedEntityType === null) {
    cc.newUserError()
      .setText("Unable to find " + entityTypeName + " in edm schema.")
      .setDebugText(
        "Unable to find " +
          entityTypeName +
          " entity edm in " +
          VENIO_EDM_SCHEMA_NS +
          " schema."
      )
      .throwException();
  }

  if (DEBUG) {
    Logger.log("Edm EntityType: " + requestedEntityType);
  }

  // Get all properties of the EntityType
  const edmProperties = requestedEntityType.getChildren();
  const requestedEdmProperties = {};

  // Parse all properties into object
  for (var i = 0; i < edmProperties.length; i++) {
    const property = edmProperties[i];
    const propertyName = property.getAttribute("Name");

    if (propertyName === null) continue;

    const propertyNameValue = propertyName.getValue();
    var propertyType = property.getAttribute("Type");
    propertyType = propertyType === null ? "NoType" : propertyType.getValue();

    metaDataMap.set(propertyNameValue, propertyType); // Save property and type to map
    requestedEdmProperties[propertyNameValue] = propertyType;
  }

  if (DEBUG) {
    Logger.log("Edm Properties: " + requestedEdmProperties);
  }

  return requestedEdmProperties;
};

const formatResponseToRow = (
  requestedFields: Fields,
  responseRows: ODataResponseRows
): GetDataRows => {
  const rows = [];
  const fields = requestedFields.asArray();

  for (var i = 0; i < responseRows.length; i++) {
    var entityObject = responseRows[i];
    var row = [];

    fields.map(function(field) {
      var fieldId = field.getId();
      if (!entityObject.hasOwnProperty(fieldId)) {
        row.push("");
      } else {
        let gdsType = getGDSType(metaDataMap.get(fieldId));
        let property = formatDataByType(entityObject[fieldId], gdsType);
        property = property === null ? "" : property;

        row.push(property);
      }
    });
    rows.push({ values: row });
  }

  return rows;
};

const formatDataByType = (data: string, type: GetDataStudioType): string => {
  var types = cc.FieldType;
  switch (type.dataType) {
    // GDS format: "2017031720"
    // Odata format: "2017-03-17T20:00:00Z" || "2017-03-17T20:00"
    case types.YEAR_MONTH_DAY_HOUR:
      data = data.replace(/[-T]/g, "").split(":")[0];
      break;
    // GDS format: "20170317"
    // Odata format: "2017-03-17"
    case types.YEAR_MONTH_DAY:
      data = data.replace(/-/g, "");
      break;
    default:
      return data;
  }
};

type CachedChunk = { [key: string]: string };
const chunkRowByBytes = (
  s: ODataResponseRows,
  maxBytes: number
): CachedChunk => {
  const result = {};
  if (s.length == 0) return result;
  const singleRowString = JSON.stringify(s[0]);
  const singleRowBlob = Utilities.newBlob("");
  singleRowBlob.setDataFromString(singleRowString);
  const singleRowSize = singleRowBlob.getBytes().length * ROW_SIZE_MULTIPLIER; // Multiply
  const rowPerCache = Math.trunc(maxBytes / singleRowSize);

  let buf = s;
  let curr = buf.slice(0, rowPerCache);

  while (buf.length) {
    let dataString = JSON.stringify(curr);
    result[Utilities.getUuid()] = dataString;
    curr = buf.slice(0, rowPerCache);
    buf = buf.slice(rowPerCache);
  }

  return result;
};

const validateCacheTTLConfig = (cache_ttl_config: string): number => {
  let cache_ttl_check = parseInt(cache_ttl_config);
  cache_ttl_check =
    cache_ttl_check > 60 ? DEFAULT_CACHE_DATA_TIMEOUT : cache_ttl_check;
  cache_ttl_check =
    cache_ttl_check < 0 ? DEFAULT_CACHE_DATA_TIMEOUT : cache_ttl_check;
  const cache_ttl = cache_ttl_check * 60.0;

  return cache_ttl;
};
