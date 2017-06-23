// Generated by CoffeeScript 1.12.6

/*
Copyright 2016-2017 Resin.io

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 */
var Promise, Raven, _, actions, capitano, capitanoExecuteAsync, errors, events, globalTunnel, plugins, proxy, resin, settings, update, validNodeVersions;

Raven = require('raven');

Raven.disableConsoleAlerts();

Raven.config(require('./config').sentryDsn, {
  captureUnhandledRejections: true,
  release: require('../package.json').version
}).install(function(logged, error) {
  console.error(error);
  return process.exit(1);
});

Raven.setContext({
  extra: {
    args: process.argv,
    node_version: process.version
  }
});

validNodeVersions = require('../package.json').engines.node;

if (!require('semver').satisfies(process.version, validNodeVersions)) {
  console.warn("Warning: this version of Node does not match the requirements of this package.\nThis package expects " + validNodeVersions + ", but you're using " + process.version + ".\nThis may cause unexpected behaviour.");
}

globalTunnel = require('global-tunnel-ng');

settings = require('resin-settings-client');

try {
  proxy = settings.get('proxy') || null;
} catch (error1) {
  proxy = null;
}

globalTunnel.initialize(proxy);

global.PROXY_CONFIG = globalTunnel.proxyConfig;

_ = require('lodash');

Promise = require('bluebird');

capitano = require('capitano');

capitanoExecuteAsync = Promise.promisify(capitano.execute);

resin = require('resin-sdk-preconfigured');

actions = require('./actions');

errors = require('./errors');

events = require('./events');

plugins = require('./utils/plugins');

update = require('./utils/update');

require('any-promise/register/bluebird');

capitano.permission('user', function(done) {
  return resin.auth.isLoggedIn().then(function(isLoggedIn) {
    if (!isLoggedIn) {
      throw new Error('You have to log in to continue\n\nRun the following command to go through the login wizard:\n\n  $ resin login');
    }
  }).nodeify(done);
});

capitano.command({
  signature: '*',
  action: function() {
    return capitano.execute({
      command: 'help'
    });
  }
});

capitano.globalOption({
  signature: 'help',
  boolean: true,
  alias: 'h'
});

capitano.command(actions.info.version);

capitano.command(actions.help.help);

capitano.command(actions.wizard.wizard);

capitano.command(actions.auth.login);

capitano.command(actions.auth.logout);

capitano.command(actions.auth.signup);

capitano.command(actions.auth.whoami);

capitano.command(actions.app.create);

capitano.command(actions.app.list);

capitano.command(actions.app.remove);

capitano.command(actions.app.restart);

capitano.command(actions.app.info);

capitano.command(actions.device.list);

capitano.command(actions.device.supported);

capitano.command(actions.device.rename);

capitano.command(actions.device.init);

capitano.command(actions.device.remove);

capitano.command(actions.device.ping);

capitano.command(actions.device.identify);

capitano.command(actions.device.reboot);

capitano.command(actions.device.shutdown);

capitano.command(actions.device.enableDeviceUrl);

capitano.command(actions.device.disableDeviceUrl);

capitano.command(actions.device.getDeviceUrl);

capitano.command(actions.device.hasDeviceUrl);

capitano.command(actions.device.restartApplication);

capitano.command(actions.device.register);

capitano.command(actions.device.move);

capitano.command(actions.device.info);

capitano.command(actions.notes.set);

capitano.command(actions.keys.list);

capitano.command(actions.keys.add);

capitano.command(actions.keys.info);

capitano.command(actions.keys.remove);

capitano.command(actions.env.list);

capitano.command(actions.env.add);

capitano.command(actions.env.rename);

capitano.command(actions.env.remove);

capitano.command(actions.os.versions);

capitano.command(actions.os.download);

capitano.command(actions.os.buildConfig);

capitano.command(actions.os.configure);

capitano.command(actions.os.initialize);

capitano.command(actions.config.read);

capitano.command(actions.config.write);

capitano.command(actions.config.inject);

capitano.command(actions.config.reconfigure);

capitano.command(actions.config.generate);

capitano.command(actions.settings.list);

capitano.command(actions.logs);

capitano.command(actions.sync);

capitano.command(actions.ssh);

capitano.command(actions.local.configure);

capitano.command(actions.local.flash);

capitano.command(actions.local.logs);

capitano.command(actions.local.promote);

capitano.command(actions.local.push);

capitano.command(actions.local.ssh);

capitano.command(actions.local.scan);

capitano.command(actions.local.stop);

capitano.command(actions.util.availableDrives);

capitano.command(actions.internal.osInit);

capitano.command(actions.build);

capitano.command(actions.deploy);

update.notify();

plugins.register(/^resin-plugin-(.+)$/).then(function() {
  var cli;
  cli = capitano.parse(process.argv);
  return events.trackCommand(cli).then(function() {
    var ref, ref1;
    if ((ref = cli.global) != null ? ref.help : void 0) {
      return capitanoExecuteAsync({
        command: "help " + ((ref1 = cli.command) != null ? ref1 : '')
      });
    }
    return capitanoExecuteAsync(cli);
  });
})["catch"](errors.handle);
