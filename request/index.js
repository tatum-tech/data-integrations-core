'use strict';

const testEnv = process.env.NODE_ENV === 'test';
const helpers = require('../helpers');
const moment = require('moment');
const periodic = testEnv ? null : require('periodicjs');
const logger = testEnv ? { silly: () => { }, } : periodic.logger;
const convertjson2xml = require('convertjson2xml');
const flat = require('flat');
const fs = require('fs');
const urlencode = require('urlencode');
const path = require('path');
let json2xml;

/**
 * Creates xml body for Corelogic call.
 * @param {Object} options Contains inputs and credit pull config file.
 * @return {Object} Returns xml data for the Corelogic call.
 */
function createBodyXML(options) {
  let { inputs, dataintegration, strategy_status } = options;
  let body = (strategy_status === 'active' && dataintegration.active_default_configuration) ? dataintegration.active_default_configuration : dataintegration.default_configuration
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
  json2xml = convertjson2xml.config(dataintegration.xml_configs || {
    'trim' : true,
    'hideUndefinedTag' : true,
    'nullValueTag' : 'full',
    'emptyStringTag' : 'full',
    'rootTag' : 'requestTag' // should be the root tag of the valid xml that is sent to the 3rd party provider
  });
  return json2xml(body);
}

function createJSONBody(options) {
  let { inputs, dataintegration, strategy_status } = options;
  if (inputs && dataintegration.inputs) {
    dataintegration.inputs.forEach(config => {
      if (config.traversal_path) {
        let traversal_arr = config.traversal_path.split('.');
        let current_body = inputs;
        for (let i = 0; i < traversal_arr.length - 1; i++) {
          let elmnt = traversal_arr[ i ];
          current_body = current_body[elmnt];
        }
        current_body[ traversal_arr[ traversal_arr.length - 1 ] ] = helpers.formatInputValue({ name: config.input_name, config, inputs, });
      } else {
        inputs[ config.input_name ] = helpers.formatInputValue({ name: config.input_name, config, inputs, });
      }
    })
  }

  if (dataintegration.custom_inputs) {
    dataintegration.custom_inputs.forEach(config => {
      inputs[ config.name ] = helpers.formatInputValue({ name: config.name, config, inputs: dataintegration.custom_inputs, });
    })
  }

  const default_configuration = (strategy_status === 'active' && dataintegration.active_default_configuration) ? dataintegration.active_default_configuration : dataintegration.default_configuration
  return Object.assign({}, default_configuration, inputs);
}

const generateDynamicQueryString = (inputs, queryParams, urlEncodeFormat) => {
  try {
    return Object.keys(queryParams).reduce((acc, queryKey) => {
      let queryVal = (inputs[queryKey] !== undefined) ? inputs[queryKey] : queryParams[queryKey];
      queryVal = urlencode(queryVal, urlEncodeFormat);
      acc.push(`${queryKey}=${queryVal}`);
      return acc;
    }, []).join('&');
  } catch(e) {
    return `error=${e.message}`;
  }
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
  let body = (dataintegration.request_type === 'xml')
    ? createBodyXML({ inputs, dataintegration, strategy_status })
    : createJSONBody({ inputs, dataintegration, strategy_status });

  // set dataintegration request options based on active or testing
  let request_options = (strategy_status === 'active' && dataintegration.active_request_options) ? dataintegration.active_request_options : dataintegration.request_options;
  if (inputs && inputs.path_variable) request_options.path = request_options.path + '/' + inputs[ inputs.path_variable ];
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
    if (requestOptionConfigs.pfx && request_options) request_options.pfx = fs.readFileSync(path.resolve(dir, filename));
  }

  if (dataintegration.custom_query_params) {
    const dynamicQueryString = generateDynamicQueryString(inputs, dataintegration.custom_query_params, dataintegration.url_encode_format || 'utf-8');
    request_options.path += `?${dynamicQueryString}`;
  }

  return {
    requestOptions: request_options,
    responseOptions: response_options,
    timeout: dataintegration.timeout,
    body,
  };
}

module.exports = parser;