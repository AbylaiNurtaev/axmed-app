Pod::Spec.new do |s|
  s.name = 'AxmedHBand'
  s.version = '0.1.0'
  s.summary = 'Foreground bracelet pairing and history sync for AxMed'
  s.description = 'Expo bridge to Veepoo: activity, sleep, vital history and stored manual readings. No firmware updates.'
  s.license = { :type => 'Proprietary' }
  s.author = 'AxMed'
  s.homepage = 'https://github.com/AbylaiNurtaev/axmed-app'
  s.source = { :git => 'https://github.com/AbylaiNurtaev/axmed-app.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'FMDB', '2.6.2'
  s.dependency 'MJExtension', '3.0.15.1'
  s.source_files = '*.swift'
  s.vendored_frameworks = 'Vendor/*.framework'
  s.frameworks = 'CoreBluetooth', 'UIKit'
  s.libraries = 'z', 'sqlite3', 'c++'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }

  required = %w[VeepooBleSDK ABParTool DFUnits GRDFUSDK JLDialUnit JL_BLEKit ZipZap]
  required.each do |name|
    binary = File.join(__dir__, 'Vendor', "#{name}.framework", name)
    raise "Missing HBand SDK: #{binary}. Run scripts/import-hband-sdk.ps1 first." unless File.file?(binary)
  end
end
