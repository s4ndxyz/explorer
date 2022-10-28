import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '@common/state/store';
import { AppConfig, showConnect, UserData, UserSession } from '@stacks/connect';
import { APP_DETAILS } from '@common/constants';
import { buildUrl } from '@components/links';
import { FinishedAuthData } from '@stacks/connect/dist/types/types/auth';
import { helloWorldContract } from '@sandbox/common/contracts';

export interface ConnectState {
  userSession: UserSession;
  userData: UserData | undefined;
  codeBody: string;
  showRightPanel: boolean;
  showCodeToolbar: boolean;
}

const initialState: ConnectState = {
  userSession: new UserSession({ appConfig: new AppConfig(['store_write', 'publish_data']) }),
  userData: undefined,
  codeBody: helloWorldContract.source,
  showRightPanel: false,
  showCodeToolbar: false,
};

export const sandboxSlice = createSlice({
  name: 'connect',
  initialState,
  reducers: {
    connect: (
      state,
      action: PayloadAction<{
        activeNetworkMode: string;
        onFinish: (data: FinishedAuthData) => void;
      }>
    ) => {
      console.log('[debug] connect', action.type);
      showConnect({
        appDetails: APP_DETAILS,
        userSession: state.userSession,
        redirectTo: buildUrl('/sandbox', action.payload.activeNetworkMode),
        onFinish: action.payload.onFinish,
      });
    },
    disconnect: state => {
      console.log('[debug] disconnect');
      state.userSession.signUserOut('/');
    },
    setUserData: (state, action: PayloadAction<{ userData: UserData }>) => {
      state.userData = action.payload.userData;
    },
    setCodeBody: (state, action: PayloadAction<{ codeBody: string }>) => {
      state.codeBody = action.payload.codeBody;
    },
    toggleRightPanel: state => {
      state.showRightPanel = !state.showRightPanel;
    },
    toggleCodeToolbar: state => {
      state.showCodeToolbar = !state.showCodeToolbar;
    },
  },
});

export const {
  connect,
  disconnect,
  setUserData,
  setCodeBody,
  toggleRightPanel,
  toggleCodeToolbar,
} = sandboxSlice.actions;

export const selectConnectSlice = (state: RootState) => state.connect;

export const selectUserSession = createSelector(
  [selectConnectSlice],
  connectSlice => connectSlice.userSession
);

export const selectUserData = createSelector(
  [selectConnectSlice],
  connectSlice => connectSlice.userData
);

export const selectCodeBody = createSelector(
  [selectConnectSlice],
  connectSlice => connectSlice.codeBody
);

export const selectShowRightPanel = createSelector(
  [selectConnectSlice],
  connectSlice => connectSlice.showRightPanel
);

export const selectShowCodeToolbar = createSelector(
  [selectConnectSlice],
  connectSlice => connectSlice.showCodeToolbar
);
