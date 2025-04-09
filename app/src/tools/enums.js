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
        LABEL: "Dwelling Duration",
        DESCRIPTION: "The time in seconds that the cursor must remain over an item before it is selected.",
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
        LABEL: "Key Tap Duration",
        DESCRIPTION: "The time in seconds that the cursor must remain over a keyboard key before it is selected.",
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
        LABEL: "Web Page Scroll Speed",
        DESCRIPTION: "The speed at which the web page scrolls when using the arrow buttons.",
        SLOW: 5,
        NORMAL: 10,
        FAST: 15,
    },
    MENU_AREA_SCROLL_DISTANCE: {
        NAME: "menuAreaScrollDistance",
        LABEL: "Sidebar Scroll Speed",
        DESCRIPTION: "The speed at which the elements in the sidebar menu are scrolled when using the arrow buttons.",
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
        DEFAULT: 0,
    },
    USE_ROBOT_JS: {
        NAME: "useRobotJS",
        DEFAULT: 1,
    },
    IS_DWELLING_ACTIVE: {
        NAME: "isDwellingActive",
        DEFAULT: 1,
    },
    DEFAULT_URL: {
        NAME: "defaultUrl",
        LABEL: "Home Page",
        DESCRIPTION: "The URL that will be opened when the application starts and a new tab is opened.",
        DEFAULT: "https://www.google.com",
    },
    DEFAULT_LAYOUT: {
        NAME: "defaultLayout",
        LABEL: "Keyboard Language",
        DESCRIPTION: "The keyboard language that will be used as a default, unless it is changed from the keyboard itself.",
        DEFAULT: KeyboardLayouts.ENGLISH,
    }
});

module.exports = {
    Settings,
    Shortcuts,
    KeyboardLayouts
};