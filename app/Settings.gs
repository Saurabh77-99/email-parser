/**
 * VIEW: Settings & Configuration
 */
function renderSettingsView() {
  var builder = CardService.newCardBuilder();
  
  builder.setHeader(CardService.newCardHeader()
    .setTitle("Parser Engine")
    .setImageUrl("https://www.gstatic.com/images/branding/product/1x/gmail_512dp.png"));

  // NAV AT TOP
  builder.addSection(createTopNavBar());

  var configSection = CardService.newCardSection()
    .setHeader("Project Configuration")
    .addWidget(CardService.newKeyValue()
      .setTopLabel("Backend URL")
      .setContent(BACKEND_URL)
      .setMultiline(true));

  var authSection = CardService.newCardSection()
    .setHeader("Permissions")
    .addWidget(CardService.newTextParagraph()
      .setText("If exports are failing, use the button below to re-authorize the spreadsheet service."))
    .addWidget(CardService.newTextButton()
      .setText("🔑 RE-AUTHORIZE GOOGLE SHEETS")
      .setOnClickAction(CardService.newAction().setFunctionName("triggerAuthorization")));

  builder.addSection(configSection);
  builder.addSection(authSection);
  
  return builder.build();
}
