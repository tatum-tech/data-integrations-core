'use strict';

const testEnv = process.env.NODE_ENV === 'test';
const helpers = require('../helpers');
const moment = require('moment');
const periodic = testEnv ? null : require('periodicjs');
const logger = testEnv ? { silly: () => { }, } : periodic.logger;
const convertjson2xml = require('convertjson2xml');
const xml2js = require('xml2js');
const flat = require('flat');
const unflatten = require('flat').unflatten;
const urlencode = require('urlencode');
const fs = require('fs');
const path = require('path');
let json2xml;

/**
 * Creates xml body for Corelogic call.
 * @param {Object} options Contains inputs and credit pull config file.
 * @return {Object} Returns xml data for the Corelogic call.
 */
function createBodyXML(options) {
  let { inputs, dataintegration, strategy_status } = options;
  let body = helpers.getXMLBodyTemplate(dataintegration, strategy_status);

  if (dataintegration.inputs) {    
    dataintegration.inputs.forEach(config => {
      if (config.traversal_path) {
        let traversal_arr = config.traversal_path.split('.');
        let current_body = body;
        for (let i = 0; i < traversal_arr.length - 1; i++) {
          let elmnt = traversal_arr[ i ];
          current_body = current_body[elmnt];
        }
        current_body[ traversal_arr[ traversal_arr.length - 1 ] ] = helpers.formatInputValue({ name: config.input_name, config, inputs, });
      }
    });
  }

  if (dataintegration.xml_library === 'xml2js') {
    const builder = new xml2js.Builder(dataintegration.xml_configs || { 
      "attrkey": '@', 
      "rootName" : "requestTag" 
    });
    return builder.buildObject(body);
  } else {
    json2xml = convertjson2xml.config(dataintegration.xml_configs || {
      'trim' : true,
      'hideUndefinedTag' : true,
      'nullValueTag' : 'full',
      'emptyStringTag' : 'full',
      'rootTag' : 'requestTag' // should be the root tag of the valid xml that is sent to the 3rd party provider
    });
    return json2xml(body);
  }
}

const getFormattedRequestJSONBody = ({ dataintegration, body }) => {
  if (!dataintegration.formatRequestJSONBody) {
    return body;
  }

  const formatRequest = new Function('body', dataintegration.formatRequestJSONBody);

  return formatRequest.call(null, body);
}

function createJSONBody(options) {
  let { inputs, dataintegration, strategy_status } = options;

  let default_configuration = (strategy_status === 'active' && dataintegration.active_default_configuration)
    ? dataintegration.active_default_configuration
    : dataintegration.default_configuration;

  let flat_default_confirguration = flat(default_configuration); 

  if (inputs && dataintegration.inputs) {
    dataintegration.inputs.forEach(config => {
      if (config.traversal_path) {
        flat_default_confirguration[config.traversal_path] = inputs[config.input_name]
      }
        // inputs[ config.input_name ] = helpers.formatInputValue({ name: config.input_name, config, inputs, });
    })
  }

  default_configuration = unflatten(flat_default_confirguration);

  // if (dataintegration.custom_inputs) {
  //   dataintegration.custom_inputs.forEach(config => {
  //     inputs[ config.name ] = helpers.formatInputValue({ name: config.name, config, inputs: dataintegration.custom_inputs, });
  //   })
  // }

  return getFormattedRequestJSONBody({ dataintegration, body: default_configuration });
}

const getRequestBody = ({ dataintegration, inputs, strategy_status }) => {
  if (dataintegration.request_type === 'xml') {
    return createBodyXML({ inputs, dataintegration, strategy_status });
  }

  if (dataintegration.request_type === 'json') {
    return createJSONBody({ inputs, dataintegration, strategy_status });
  }

  if (dataintegration.request_type === 'form-urlencoded') {
    const body = createJSONBody({ inputs, dataintegration, strategy_status });

    return urlencode.stringify(body);
  }

  return null;
}

/**
 * Dynamic request parser
 * @param {Object} options Contains dataintegration mongo document and state.
 * @return {Object} Returns fetch options for the api call.
 */
async function parser(options) {
  let { dataintegration, state, } = options;
  const strategy_status = state.strategy_status || 'testing';
  let dir, filename;
  let inputs = helpers.getInputs(options);

  let body = getRequestBody({ inputs, dataintegration, strategy_status });

  // set dataintegration request options based on active or testing
  let request_options = (strategy_status === 'active' && dataintegration.active_request_options) ? dataintegration.active_request_options : dataintegration.request_options;

  if (inputs) {
    helpers.changeRequestOptionsByInputs({ inputs, request_options });
  }

  let response_options = dataintegration.response_option_configs || {};

  body = dataintegration.stringify ? JSON.stringify(body) : body;
  if (dataintegration.require_security_cert && dataintegration.credentials && dataintegration.credentials.security_certificate) {
    dir = 'security_certificates';
    let Bucket = dataintegration.credentials.security_certificate.attributes.cloudcontainername;
    let Key = dataintegration.credentials.security_certificate.attributes.cloudfilepath;
    let client_encryption_algo = dataintegration.credentials.security_certificate.attributes.client_encryption_algo;
    filename = moment(dataintegration.credentials.security_certificate.createdat).format('YYYY-MM-DD_h:mm:ss_a_') + dataintegration.credentials.security_certificate.attributes.original_filename.replace(/\s+/g, '_');
    let securityCertExists = fs.existsSync(path.resolve(dir, filename));
    if (!securityCertExists) await helpers.decryptSecurityCert({ Bucket, Key, client_encryption_algo, filename, dir, });
  }
  
  if (dataintegration.request_option_configs) {
    let requestOptionConfigs = dataintegration.request_option_configs;
    if (requestOptionConfigs.set_content_length && request_options && request_options.headers) request_options.headers[ 'Content-Length' ] = Buffer.byteLength(body);
    if (requestOptionConfigs.clientId && requestOptionConfigs.clientSecret && request_options) {
      // let user = requestOptionConfigs.clientId;
      // let password = requestOptionConfigs.clientSecret;

      // let base64encodedData = Buffer.from(user + ':' + password).toString('base64');

      // request_options.headers['Authorization'] = 'Basic ' + base64encodedData
      request_options.auth = {
        username: requestOptionConfigs.clientId,
        password: requestOptionConfigs.clientSecret,
      };
      
    }
    if (requestOptionConfigs.tokenInputVariable && request_options)  {
      request_options.headers['Authorization'] = 'Bearer ' + (inputs[requestOptionConfigs.tokenInputVariable] || '')
    }
  }

  if (dataintegration.custom_query_params) {
    // const dynamicQueryString = helpers.generateDynamicQueryString(inputs, dataintegration.custom_query_params, dataintegration.url_encode_format);
    // request_options.path += `?${dynamicQueryString}`;
    request_options.params = custom_query_params;
  }

  return {
    requestOptions: request_options,
    responseOptions: response_options,
    timeout: dataintegration.timeout,
    body,
  };
}

module.exports = parser;