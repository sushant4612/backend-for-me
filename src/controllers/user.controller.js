import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

const genrateAccessAndRefreshToken = async (userId) => {
    try{
        const user = await User.findById(userId);
        const accessToken = user.genrateAccessToken();
        const refreshToken = user.genrateRefreshToken()

        user.refreshToken =  refreshToken;
        await user.save({ validateBeforeSave : false} )

        return {accessToken , refreshToken};

    }catch(err){
        throw ApiError(500, "Something went wrong while genrating refresh token and access token")
    }
}

const registerUser = asyncHandler( async (req,res) => {
    // get user detail from ffrontend
    const {fullname, email, username, password} = req.body;
    //validation - not empty
    if(
        [fullname, email, username, password].some((field) => 
        field?.trim() === "")
    ) {
        throw new ApiError(400, "All field are required");
    }
    //check is user already exists : username, email
    
    const existedUser = await User.findOne({
        $or: [{ username }, {email}]
    })

    if(existedUser){
        throw new ApiError(409, "User with email or username already exists")
    }
    //check for images, check for avatar
    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path

    let coverImageLocalPath;

    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].pathz̧
    }

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file required")
    }
    //upload them to cloudinary, avatar
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if(!avatar){
        throw new ApiError(400, "Avatar file required")
    }
    //create user object - create entry in db
    const user = await User.create({
        fullname,
        avatar : avatar.url,
        coverImage : coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()

    })

    //remove password and refresh token field response
    const createdUser = await User.findById(user._id).select("-password -refreshToken")
    
    //check for user creation
    if(!createdUser){
        throw new ApiError(500, "Something went wromg while registering the user")
    }
    //return response
    return res.status(201).json(
        new ApiResponse(200,createdUser,"User registered Successfully")
    )
})

const loginUser = asyncHandler( async (req, res) => {
    // req body -> data
    const {email, username, password} = req.body; 
    
    // username or email 
    if(!email && !username){
        throw new ApiError(400, "Username or password is required")
    }

    // find the User
    const user = await User.findOne({
        $or : [ {username}, {email}]
    })

    if(!user){
        throw new ApiError(404, "User does't exists")
    }
    
    // password check

    const isPasswordVaid = await user.isPasswordCorrect(password);
    if(!isPasswordVaid){
        throw new ApiError(401, "Password incorrect")
    }

    // access and Refresh token

    const {accessToken, refreshToken} = await genrateAccessAndRefreshToken(user._id);
    // send cookie

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200).cookie("accessToken",accessToken, options).cookie("refreshToken",refreshToken, options).json(
        new ApiResponse(200,{
            user: loggedInUser,
            accessToken,
            refreshToken
        },
        "User logged In Succesfully"
    )
    )
})

const logoutUser = asyncHandler( async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200).clearCookie("accessToken", options).clearCookie("refreshToken",options).json(new ApiResponse(200,{},"USer logged out successfully"))
})

const refreshAccessToken = asyncHandler( async (req, res) => {
    const incommingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if(!incommingRefreshToken){
        throw new ApiError(401, "Unauthorized Request");
    }

    try {
        const decodedToken = jwt.verify(incommingRefreshToken, REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken?._id);
    
        if(!user){
            throw new ApiError(401, "Invalid refresh token");
        }
    
        if(incommingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Refresh token is expired or used");
        }
    
        const options = {
            httpOnly : true,
            secure : true
        }
    
        const {accessToken, newRefreshToken} = genrateAccessAndRefreshToken(user._id);
    
        return res.status(200).cookie("accessToken", accessToken, options).cookie("refreshToken",newRefreshToken, options)
        .json(200,
            new ApiResponse(200,{accessToken, refreshToken : newRefreshToken},
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})

const changeCurrentPassword = asyncHandler( async (req, res) => {

    const {oldPassword, newPassword} = req.body;

    const user = await User.findById(req.user?._id);
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if(!isPasswordCorrect){
        throw new ApiError(400, "Invalid old password");
    }

    user.password = newPassword
    await user.save({validateBeforeSave : false})

    return res.status(200).json(new ApiResponse(200,{}, "Password change succesfully"))
})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res.status(200).json(200, req.user, "current user fetched succesfully");
})

const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullname, email } = req.body;

    if(!fullname || !email){
        throw new ApiError(400, "All fields are required");
    }

    const user =  User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullname,
                email
            }
        },
        {new : true}
    ).select("-password");

    return res.status(200).json(new ApiResponse(200, user, "Account details updated"))
})

const updateUserAvatar = asyncHandler(async (req, res) => {

    const avatarLocalPath = req.file?.path

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if(!avatar.url){
        throw new ApiError(400, "Error while uploading on avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar: avatar.url
            }
        },
        {new : true}
    ).select("-password")

    return res.status(200).json(new ApiResponse(200,user, "Avatar image updated successfully"));
})

const updateUserCoverImage = asyncHandler(async (req, res) => {

    const coverImageLocalPath = req.file?.path

    if(!coverImageLocalPath){
        throw new ApiError(400, "Cover image file is missing")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!coverImage.url){
        throw new ApiError(400, "Error while uploading on avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar: coverImage.url
            }
        },
        {new : true}
    ).select("-password")

    return res.status(200).json(new ApiResponse(200,user, "Cover image updated successfully"));
})

export { registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    
 }