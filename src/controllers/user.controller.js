import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

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

export { registerUser }