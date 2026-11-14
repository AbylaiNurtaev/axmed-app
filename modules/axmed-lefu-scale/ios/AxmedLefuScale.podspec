Pod::Spec.new do |s|
  s.name = 'AxmedLefuScale'
  s.version = '0.1.0'
  s.summary = 'Foreground LEFU scale measurement reader for AxMed'
  s.description = 'Reads supported LEFU scales through the manufacturer Bluetooth Kit.'
  s.license = { :type => 'Proprietary' }
  s.author = 'AxMed'
  s.homepage = 'https://github.com/AbylaiNurtaev/axmed-app'
  s.source = { :git => 'https://github.com/AbylaiNurtaev/axmed-app.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
  s.resources = 'Resources/Device.json'
  s.vendored_frameworks = [
    'Frameworks/PPBaseKit.xcframework',
    'Frameworks/PPBluetoothKit.xcframework'
  ]
  s.frameworks = 'CoreBluetooth'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'OTHER_LDFLAGS' => '$(inherited) -ObjC'
  }
end
