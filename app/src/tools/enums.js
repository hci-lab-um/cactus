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

const KeyboardLayouts = Object.freeze({
    ENGLISH: "en",
    FRENCH: "fr",
    ITALIAN: "it",
    MALTESE: "mt",
    NUMERIC: "numeric"
});

const Settings = Object.freeze({
    DWELL_TIME: {
        NAME: "dwellTime",
        SHORT: 1000,
        NORMAL: 1500,
        LONG: 2000,
    },
    DWELL_RANGE: {
        NAME: "precisionDwellRange",
        DEFAULT: 5
    },
    KEYBOARD_DWELL_TIME: {
        NAME: "keyboardDwellTime",
        SHORT: 1000,
        NORMAL: 1500,
        LONG: 2000,
    },
    RANGE_WIDTH: {
        NAME: "dwellRangeWidth",
        DEFAULT: 150,
    },
    RANGE_HEIGHT: {
        NAME: "dwellRangeHeight",
        DEFAULT: 50,
    },
    TAB_VIEW_SCROLL_DISTANCE: {
        NAME: "tabViewScrollDistance",
        SLOW: 5,
        NORMAL: 10,
        FAST: 15,
    },
    MENU_AREA_SCROLL_DISTANCE: {
        NAME: "menuAreaScrollDistance",
        SLOW: 100,
        NORMAL: 200,
        FAST: 300,
    },
    MENU_AREA_SCROLL_INTERVAL_IN_MS: {
        NAME: "menuAreaScrollIntervalInMs",
        DEFAULT: 300,
    },
    USE_NAV_AREAS: {
        NAME: "useNavAreas",
        DEFAULT: false,
    },
    USE_ROBOT_JS: {
        NAME: "useRobotJS",
        DEFAULT: true,
    },
    IS_DWELLING_ACTIVE: {
        NAME: "isDwellingActive",
        DEFAULT: true,
    },
    DEFAULT_URL: {
        NAME: "defaultUrl",
        DEFAULT: "https://www.google.com",
    },
    DEFAULT_LAYOUT: {
        NAME: "defaultLayout",
        DEFAULT: KeyboardLayouts.ENGLISH,
    }
});

module.exports = {
    Settings,
    Shortcuts,
    KeyboardLayouts
};