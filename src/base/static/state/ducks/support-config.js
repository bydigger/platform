// Selectors:
export const supportConfigSelector = state => {
  return state.supportConfig;
};

// Actions:
const SET_CONFIG = "support/SET_CONFIG";

// Action creators:
export function setSupportConfig(config) {
  return { type: SET_CONFIG, payload: config };
}

// Reducers:
// TODO(luke): refactor our current implementation in AppView to use
const INITIAL_STATE = null;

export default function reducer(state = INITIAL_STATE, action) {
  switch (action.type) {
    case SET_CONFIG:
      return {
        ...state,
        ...action.payload,
      };
    default:
      return state;
  }
}
