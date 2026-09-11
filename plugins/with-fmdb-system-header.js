const { withPodfile, CodeGenerator } = require('expo/config-plugins');

// FMDB 2.6.2 matches the vendor SDK. Backport only its system-header import
// after CocoaPods downloads sources, on both EAS and local native builds.
function addFmdbHook(contents) {
  return CodeGenerator.mergeContents({
    tag: 'axmed-fmdb-system-header',
    src: contents,
    newSrc: "    system(ENV['NODE_BINARY'] || 'node', File.join(__dir__, '..', 'scripts', 'patch-fmdb-ios.cjs'), __dir__) || raise('AxMed FMDB header fix failed')",
    anchor: /post_install do \|installer\|/,
    offset: 1,
    comment: '#',
  }).contents;
}

module.exports = function withFmdbSystemHeader(config) {
  return withPodfile(config, (mod) => {
    mod.modResults.contents = addFmdbHook(mod.modResults.contents);
    return mod;
  });
};
module.exports.addFmdbHook = addFmdbHook;
