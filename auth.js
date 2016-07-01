'use strict';

const fs = require('fs');
const yaml = require('js-yaml');

// Get the user's home directory
let getUserHome = function () {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
};

// Fetch the configuration file
const CONFIG_FILE = getUserHome() + '/.dodrc.yml';

let config, token; // this variable will store the token for the current session

(function () {
  // make sure the configuration file exists
  fs.stat(CONFIG_FILE, function (err) {
    if (err === null) {
      return; // exit function if the config file exist
    } else if (err.code == 'ENOENT') {
      fs.writeFile(CONFIG_FILE); // create config file if it doesn't exist
    } else {
      console.log('Unexpected error: ', err.code);
    }
  });

  try {
    config = yaml.safeLoad(fs.readFileSync(CONFIG_FILE, 'utf8')); // load config file
    token = config.access_token;
  } catch (e) {
    console.log(chalk.red('Type \"authorize\" and provide your API token to authorize your DigitalOcean account.'));
  }
}());

module.exports = { 'auth': { 'bearer': token } };

