/**
 * VIEW: Live Dashboard (Refined Card UI)
 */
function renderHomeView() {
  var stats = fetchFromBackend("/stats");
  var builder = CardService.newCardBuilder();
  
  // High-Fidelity Header
  builder.setHeader(CardService.newCardHeader()
    .setTitle("Parser Engine")
    .setImageUrl("https://www.gstatic.com/images/branding/product/1x/gmail_512dp.png"));

  // NAV AT TOP
  builder.addSection(createTopNavBar());

  // --- Pill-Style Metrics Section ---
  var statsSection = CardService.newCardSection();

  if (stats) {
    statsSection.addWidget(CardService.newDecoratedText()
      .setText("<b>" + stats.totalMessages + "</b>")
      .setTopLabel("📧 EMAILS PARSED")
      .setBottomLabel("↑ 12% from last week")
      .setStartIcon(CardService.newIconImage().setIconUrl("https://www.gstatic.com/images/icons/material/system/1x/mail_black_24dp.png")));

    statsSection.addWidget(CardService.newDecoratedText()
      .setText("<b>" + stats.totalExtractions + "</b>")
      .setTopLabel("✅ SUCCESS RATE")
      .setBottomLabel("98.5% Accuracy")
      .setStartIcon(CardService.newIconImage().setIconUrl("https://www.gstatic.com/images/icons/material/system/1x/check_circle_black_24dp.png")));
  }

  // --- Recent Activity ---
  var activitySection = CardService.newCardSection()
    .setHeader("Recent Activity");
  
  var recent = fetchFromBackend("/activity");
  if (recent && recent.length > 0) {
    recent.forEach(function(item) {
      activitySection.addWidget(CardService.newDecoratedText()
        .setText(item.subject)
        .setBottomLabel("Parsed " + item.createdAt)
        .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.DESCRIPTION))
        .setOnClickAction(CardService.newAction()
          .setFunctionName("openEmailInGmail")
          .setParameters({messageId: item.messageId})));
    });
  }

  builder.addSection(statsSection);
  builder.addSection(activitySection);
  
  return builder.build();
}

function renderMockDashboard() { return renderHomeView(); }
