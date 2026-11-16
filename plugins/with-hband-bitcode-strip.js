const { withPodfile, CodeGenerator } = require('expo/config-plugins');

function addBitcodeStripHook(contents) {
  return CodeGenerator.mergeContents({
    tag: 'axmed-hband-bitcode-strip',
    src: contents,
    newSrc: "    system(ENV['NODE_BINARY'] || 'node', File.join(__dir__, '..', 'scripts', 'strip-hband-bitcode.cjs')) || raise('AxMed HBand bitcode strip failed')",
    anchor: /post_install do \|installer\|/,
    offset: 1,
    comment: '#',
  }).contents;
}

module.exports = function withHbandBitcodeStrip(config) {
  return withPodfile(config, mod => {
    mod.modResults.contents = addBitcodeStripHook(mod.modResults.contents);
    return mod;
  });
};
module.exports.addBitcodeStripHook = addBitcodeStripHook;
