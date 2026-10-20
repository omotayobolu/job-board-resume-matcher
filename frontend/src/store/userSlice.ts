import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { axiosInstance } from "@/lib/axios-instance";

const initialState = {
  user: {},
  isLoading: false,
};

export const fetchUser = createAsyncThunk("user/fetchUser", async () => {
  const response = await axiosInstance.get("/user");
  return response.data;
});

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload;
    },
    clearUser: (state) => {
      state.user = {};
      state.isLoading = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUser.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchUser.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.isLoading = false;
      })
      .addCase(fetchUser.rejected, (state) => {
        state.isLoading = false;
      });
  },
});

export type Role = "job_seeker" | "recruiter";

export type UserType = {
  id: string;
  name: string;
  email: string;
  role?: Role | null;
  hasprofile: boolean;
};

type UserState = {
  user: UserType;
  isLoading: boolean;
};

export const selectUser = (state: { user: UserState }) => state.user.user;
export const { setUser, clearUser } = userSlice.actions;
export default userSlice.reducer;
