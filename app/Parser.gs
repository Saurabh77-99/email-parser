/**
 * VIEW: Static Mock Extraction Detail (Contextual)
 */
function renderMockParser(e) {
  var builder = CardService.newCardBuilder();
  
  builder.setHeader(CardService.newCardHeader()
    .setTitle("Parser Engine")
    .setImageUrl("https://www.gstatic.com/images/branding/product/1x/gmail_512dp.png"));

  // NAV AT TOP
  builder.addSection(createTopNavBar());

  // --- Email Data Mock ---
  var detailSection = CardService.newCardSection()
    .setHeader("Extraction Detail")
    .addWidget(CardService.newKeyValue().setTopLabel("Vendor Name").setContent("Stark Industries").setBottomLabel("98% CONF.").setIcon(CardService.Icon.PERSON))
    .addWidget(CardService.newKeyValue().setTopLabel("Invoice Number").setContent("INV-2023-0045").setIcon(CardService.Icon.DESCRIPTION))
    .addWidget(CardService.newKeyValue().setTopLabel("Total Amount").setContent("$ 4,250.00 USD").setIcon(CardService.Icon.STAR));

  // --- Actions ---
  var actionSection = CardService.newCardSection()
    .addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton().setText("🔄 RE-PARSE").setOnClickAction(CardService.newAction().setFunctionName("mockAction")))
      .addButton(CardService.newTextButton().setText("🗑️ DELETE").setOnClickAction(CardService.newAction().setFunctionName("mockAction"))));

  builder.addSection(detailSection);
  builder.addSection(actionSection);
  
  return [builder.build()];
}

function showRuleSelection(e) {
  var rules = fetchFromBackend("/rules");
  var section = CardService.newCardSection().setHeader("Apply a Rule");
  if (rules) {
    rules.forEach(function(rule) {
      section.addWidget(CardService.newDecoratedText()
        .setText(rule.name)
        .setBottomLabel(rule.criteriaQuery)
        .setButton(CardService.newTextButton().setText("PARSE").setOnClickAction(CardService.newAction()
          .setFunctionName("executeManualExtraction").setParameters({ruleId: rule.id.toString(), messageId: e.gmail.messageId}))));
    });
  }
  return CardService.newCardBuilder().addSection(section).build();
}

function executeManualExtraction(e) {
  var result = ingestMessage(GmailApp.getMessageById(e.parameters.messageId), parseInt(e.parameters.ruleId));
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(result ? "Extraction Successful!" : "Failed."))
    .setNavigation(CardService.newNavigation().popToRoot().updateCard(renderHomeView()))
    .build();
}

function mockAction() {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("MOCK: Action triggered."))
    .build();
}
