/** * VIEW: Live Dashboard */ function renderHomeView() {
  var builder = CardService.newCardBuilder();
  builder.setHeader(
    CardService.newCardHeader()
      .setTitle("Parser Engine")
      .setImageUrl(
        "https://www.gstatic.com/images/branding/product/1x/gmail_512dp.png",
      ),
  );
  builder.addSection(createTopNavBar());

  var stats = null;
  try {
    stats = fetchFromBackend("/stats");
  } catch (e) {}

  var statsSection = CardService.newCardSection().setHeader("Stats");
  statsSection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel("Emails Parsed")
      .setText(stats ? String(stats.totalMessages) : "0"),
  );
  statsSection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel("Extractions")
      .setText(stats ? String(stats.totalExtractions) : "0"),
  );
  statsSection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel("Last Sync")
      .setText(stats ? String(stats.lastSync) : "Never"),
  );

  var syncSection = CardService.newCardSection().addWidget(
    CardService.newTextButton()
      .setText("🔄 SYNC NOW")
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setOnClickAction(
        CardService.newAction().setFunctionName("triggerFullSync"),
      ),
  );
  builder.addSection(statsSection);
  builder.addSection(syncSection);

  var recent = null;
  try {
    recent = fetchFromBackend("/activity");
  } catch (e) {}
  var activitySection =
    CardService.newCardSection().setHeader("Recent Activity");
  if (recent && recent.length > 0) {
    recent.forEach(function (item) {
      activitySection.addWidget(
        CardService.newDecoratedText()
          .setText(item.subject || "No subject")
          .setBottomLabel(item.createdAt || ""),
      );
    });
  } else {
    activitySection.addWidget(
      CardService.newDecoratedText()
        .setText("No emails parsed yet.")
        .setBottomLabel("Run a sync to get started"),
    );
  }
  builder.addSection(activitySection);
  return builder.build();
}
function renderMockDashboard() {
  return renderHomeView();
}
