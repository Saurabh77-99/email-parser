const BACKEND_URL = "https://backend-orcin-three-70.vercel.app";

function buildHomePage() { return renderHomeView(); }
function onGmailMessageOpen(e) { return renderMockParser(e); }
function showRulesPage() { return renderRulesView(); }
function showDatasetsPage() { return renderDatasetsView(); }
function showSettingsPage() { return renderSettingsView(); }

/**
 * TOP NAV BAR: 4-Column Unified Grid
 */
function createTopNavBar() {
  var navGrid = CardService.newGrid()
    .setNumColumns(4)
    .addItem(CardService.newGridItem()
      .setSubtitle("🏠 HOME")
      .setTextAlignment(CardService.HorizontalAlignment.CENTER)
      .setIdentifier("nav_home"))
    .addItem(CardService.newGridItem()
      .setSubtitle("⚙️ RULES")
      .setTextAlignment(CardService.HorizontalAlignment.CENTER)
      .setIdentifier("nav_rules"))
    .addItem(CardService.newGridItem()
      .setSubtitle("📂 DATA")
      .setTextAlignment(CardService.HorizontalAlignment.CENTER)
      .setIdentifier("nav_data"))
    .addItem(CardService.newGridItem()
      .setSubtitle("🛠️ SET")
      .setTextAlignment(CardService.HorizontalAlignment.CENTER)
      .setIdentifier("nav_settings"))
    .setOnClickAction(CardService.newAction().setFunctionName("handleNavClick"));

  return CardService.newCardSection()
    .setCollapsible(false)
    .addWidget(navGrid)
    .addWidget(CardService.newDivider());
}

function handleNavClick(e) {
  var id = e.parameters.grid_item_identifier;
  if (id === "nav_home") return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(renderHomeView())).build();
  if (id === "nav_rules") return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(renderRulesView())).build();
  if (id === "nav_data") return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(renderDatasetsView())).build();
  if (id === "nav_settings") return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(renderSettingsView())).build();
}

function openEmailInGmail(e) {
  return CardService.newUniversalActionResponseBuilder()
    .setOpenLink(CardService.newOpenLink().setUrl("https://mail.google.com/mail/u/0/#inbox/" + e.parameters.messageId))
    .build();
}
