'use strict';

const helpers = require('../helpers');

/**
 * Formatter for Corelogic.
 * @param {Object} options Contains dataintegration file and state.
 * @return {Object} Returns output of api mapped to variables
 */
async function formatter(options) {
  let response = await helpers.customResponseParser(Object.assign({ responseTraversalPath: options.dataintegration.outputs, }, options));
  return response;
}

module.exports = formatter;