const validateCredentials = (key: string, path: string): boolean => {
  if (DEBUG) {
    Logger.log("Validating Credentials...");
    Logger.log("Path: " + path);
    Logger.log("Key: " + key);
  }

  if (key === null) return false;

  // First time using connector
  if (path === null) return true;

  var URLs = [path, "/"];
  var response;
  try {
    response = UrlFetchApp.fetch(URLs.join(""), {
      method: "get",
      headers: {
        ApiKey: key,
      },
      muteHttpExceptions: true,
    });
  } catch (error) {
    cc.newUserError()
      .setText("something is wrong with the URL")
      .setDebugText(
        "something is wrong with the URL " +
          error +
          " key: " +
          key +
          "path: " +
          path
      )
      .throwException();

    return false;
  }

  if (DEBUG) {
    Logger.log(
      "Got response from service." +
        response +
        " StatusCode: " +
        response.getResponseCode()
    );
  }

  if (response.getResponseCode() !== 200) {
    resetAuth();
    cc.newUserError()
      .setText("wrong response status code.")
      .setDebugText(
        "wrong response status code." +
          response.getResponseCode() +
          " " +
          response
      )
      .throwException();

    return false;
  }

  return true;
};

// https://developers.google.com/datastudio/connector/auth#resetauth
const resetAuth = () => {
  if (DEBUG) {
    Logger.log("Resetting authentication...");
  }
  var user = PropertiesService.getUserProperties();
  user.deleteAllProperties();
};

// https://developers.google.com/datastudio/connector/reference#getauthtype
const getAuthType = (): GetAuthTypeResponse => {
  const AuthTypes = cc.AuthType;
  return cc
    .newAuthTypeResponse()
    .setAuthType(AuthTypes.KEY)
    .build();
};

// https://developers.google.com/datastudio/connector/auth#isauthvalid
const isAuthValid = () => {
  var user = PropertiesService.getUserProperties();
  const path = user.getProperty(URL_PROPERTY_KEY);
  const key = user.getProperty(AUTH_PROPERTY_KEY);
  return validateCredentials(key, path);
};

// https://developers.google.com/datastudio/connector/auth#setcredentials
const setCredentials = (request: SetCredentialsRequest): SetCredentialsResponse => {
  var user = PropertiesService.getUserProperties();
  const path = user.getProperty(URL_PROPERTY_KEY);
  const key = (request as KeyCredentials).key;

  var validKey = validateCredentials(key, path);
  if (!validKey) {
    resetAuth();
    return {
      errorCode: "INVALID_CREDENTIALS",
    };
  }
  var user = PropertiesService.getUserProperties();
  user.setProperty(AUTH_PROPERTY_KEY, key);

  return {
    errorCode: "NONE",
  };
};
