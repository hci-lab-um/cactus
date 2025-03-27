const Settings = Object.freeze({
    DWELL_TIME: "dwellTime",
    DWELL_RANGE: "dwellRange",
    KEYBOARD_DWELL_TIME: "keyboardDwellTime",
    RANGE_WIDTH: "rangeWidth",
    RANGE_HEIGHT: "rangeHeight",
    TAB_VIEW_SCROLL_DISTANCE: "tabViewScrollDistance",
    MENU_AREA_SCROLL_DISTANCE: "menuAreaScrollDistance",
    MENU_AREA_SCROLL_INTERVAL_IN_MS: "menuAreaScrollIntervalInMs",
    ACTIVATE_NAV_AREAS: "activateNavAreas",
    USE_ROBOT_JS: "useRobotJS",
    DEFAULT_URL: "defaultUrl",
    DEFAULT_LAYOUT: "defaultLayout"
});

const Shortcuts = Object.freeze({
    CLICK: "click",
    TOGGLE_OMNI_BOX: "toggleOmniBox",
    TOGGLE_DWELLING: "toggleDwelling",
    ZOOM_IN: "zoomIn",
    ZOOM_OUT: "zoomOut",
    SIDEBAR_SCROLL_UP: "sidebarScrollUp",
    SIDEBAR_SCROLL_DOWN: "sidebarScrollDown",
    NAVIGATE_FORWARD: "navigateForward",
    NAVIGATE_BACK: "navigateBack"
});

module.exports = {
    Settings,
    Shortcuts
};