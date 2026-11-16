import XCTest

final class CaptureTests: XCTestCase {
  func testCaptureMainScreens() throws {
    continueAfterFailure = false
    let app = XCUIApplication(bundleIdentifier: "com.anonymous.pochka2new")
    app.launch()
    let welcome = app.buttons["Войти в аккаунт"]
    XCTAssertTrue(welcome.waitForExistence(timeout: 30), "Welcome must load")
    welcome.tap()
    let email = app.textFields["Email"]
    XCTAssertTrue(email.waitForExistence(timeout: 10))
    email.tap()
    email.typeText(try XCTUnwrap(ProcessInfo.processInfo.environment["AXMED_PREVIEW_EMAIL"]))
    let password = app.secureTextFields["Пароль"]
    password.tap()
    password.typeText(try XCTUnwrap(ProcessInfo.processInfo.environment["AXMED_PREVIEW_PASSWORD"]))
    app.buttons["Войти"].tap()

    let home = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Домой")).firstMatch
    XCTAssertTrue(home.waitForExistence(timeout: 30), "Authenticated main app must load")
    XCTAssertTrue(app.staticTexts["Демонстрационные данные"].waitForExistence(timeout: 10))
    let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("AxMedCaptures")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    for (name, label) in [("01-home", "Домой"), ("02-health", "Здоровье"), ("03-plan", "План"), ("04-profile", "Профиль")] {
      let tab = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch
      XCTAssertTrue(tab.waitForExistence(timeout: 10))
      tab.tap()
      // Wait for animations/network-driven content to settle before the store capture.
      if label == "Профиль" { XCTAssertTrue(app.staticTexts["Александр"].waitForExistence(timeout: 15)) }
      sleep(2)
      try XCUIScreen.main.screenshot().pngRepresentation.write(to: directory.appendingPathComponent(name + ".png"))
    }
  }
}
