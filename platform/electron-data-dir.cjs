const path = require('path');

function resolveElectronDataDir({ platform, home, userData, env, existsSync }) {
  if (env.OMNITERM_DATA_DIR) return env.OMNITERM_DATA_DIR;

  if (platform === 'linux') {
    const legacy = path.posix.join(home, '.local', 'share', 'omniterm');
    if (existsSync(legacy)) return legacy;
  }

  return userData;
}

module.exports = { resolveElectronDataDir };
