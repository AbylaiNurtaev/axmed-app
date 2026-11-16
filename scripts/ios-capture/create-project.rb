require 'xcodeproj'
require 'json'
require 'rexml/document'

dir = File.expand_path(__dir__)
project = Xcodeproj::Project.new(File.join(dir, 'AxMedCapture.xcodeproj'))
target = project.new_target(:ui_test_bundle, 'AxMedCaptureTests', :ios, '16.4')
target.add_file_references([project.main_group.new_file('CaptureTests.swift')])
target.build_configurations.each do |configuration|
  configuration.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.axmed.capturetests',
    'GENERATE_INFOPLIST_FILE' => 'YES',
    'SWIFT_VERSION' => '5.0',
    'CODE_SIGNING_ALLOWED' => 'NO',
    'TARGETED_DEVICE_FAMILY' => '1,2',
    'SDKROOT' => 'iphonesimulator'
  })
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(target)
scheme.add_test_target(target)
scheme.test_action.build_configuration = 'Debug'
scheme.save_as(project.path, 'AxMedCaptureTests', true)
credentials = JSON.parse(ENV.fetch('AXMED_PREVIEW_CREDENTIALS'))
puts "::add-mask::#{credentials.fetch('password')}"
file = File.join(project.path, 'xcshareddata/xcschemes/AxMedCaptureTests.xcscheme')
document = REXML::Document.new(File.read(file))
test_action = document.elements['Scheme/TestAction']
test_action.attributes['shouldUseLaunchSchemeArgsEnv'] = 'NO'
variables = test_action.add_element('EnvironmentVariables')
{'AXMED_PREVIEW_EMAIL' => credentials.fetch('email'), 'AXMED_PREVIEW_PASSWORD' => credentials.fetch('password')}.each do |key, value|
  variables.add_element('EnvironmentVariable', {'key' => key, 'value' => value, 'isEnabled' => 'YES'})
end
File.write(file, document.to_s)
