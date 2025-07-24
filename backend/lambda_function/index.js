const AWS = require('aws-sdk'); // Import the AWS SDK for JavaScript to interact with AWS services
const S3 = new AWS.S3({ signatureVersion: 'v4', region: process.env.AWS_REGION }); // Initialize the S3 client with Signature Version 4 and the current AWS region from environment variables

// Main handler function for the Lambda. AWS Lambda calls this function when it is invoked.
// The 'event' object contains data about the invocation, including API Gateway request details.
exports.handler = async (event) => {
    // Retrieve the S3 bucket name from Lambda's environment variables.
    // This is a secure practice as it avoids hardcoding sensitive info in the code.
    const bucketName = process.env.S3_BUCKET_NAME;

    // Extract the 'key' (S3 object path/filename) from the API Gateway's query parameters.
    // This 'key' tells us which specific file the user wants to access.
    const objectKey = event.queryStringParameters ? event.queryStringParameters.key : null;

    // Define how long the generated presigned URL will be valid, in seconds.
    // 300 seconds = 5 minutes. This is a critical security measure for temporary access.
    const expiresSeconds = 300;

    // Determine the S3 action for which the URL is presigned.
    // It defaults to 'getObject' (for downloading) if no 'action' parameter is provided.
    // It can also be 'putObject' (for uploading).
    const action = event.queryStringParameters && event.queryStringParameters.action ? event.queryStringParameters.action : 'getObject';

    // Extract the 'contentType' from the API Gateway's query parameters.
    // This is primarily important for 'putObject' (upload) operations to ensure the correct MIME type is set on the uploaded file in S3.
    const contentType = event.queryStringParameters && event.queryStringParameters.contentType ? event.queryStringParameters.contentType : null;

    // --- Input Validation ---
    // Check if the 'objectKey' (filename/path) is provided in the request.
    if (!objectKey) {
        // If missing, return a 400 Bad Request error to the client.
        return {
            statusCode: 400,
            headers: {
                'Access-Control-Allow-Origin': '*', // CORS header: Allows requests from any origin (for PoC). In production, specify your frontend domain.
                'Content-Type': 'application/json' // Indicate that the response body is JSON.
            },
            body: JSON.stringify({ message: 'Missing "key" query parameter for the S3 object.' })
        };
    }

    // Check if the 'action' parameter is valid ('getObject' or 'putObject').
    if (!['getObject', 'putObject'].includes(action)) {
         // If invalid, return a 400 Bad Request error.
         return {
            statusCode: 400,
            headers: {
                'Access-Control-Allow-Origin': '*', // CORS header
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: 'Invalid "action" specified. Must be "getObject" or "putObject".' })
        };
    }

    // --- Core Logic: Generate Presigned URL ---
    try {
        // Prepare the parameters for the S3 getSignedUrlPromise method.
        const params = {
            Bucket: bucketName,    // The S3 bucket to target
            Key: objectKey,        // The specific object (file) within the bucket
            Expires: expiresSeconds // The duration for which the URL is valid
        };

        // If the action is 'putObject' (upload) and a contentType is provided,
        // add it to the parameters. This is crucial for S3 to correctly handle uploads.
        if (action === 'putObject' && contentType) {
            params.ContentType = contentType;
        }

        // Generate the presigned URL by calling the S3 service.
        // The Lambda's IAM role permissions dictate what this URL can do.
        const url = await S3.getSignedUrlPromise(action, params);

        // Return a successful 200 OK response with the generated presigned URL.
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*', // CORS header
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ presignedUrl: url, key: objectKey, action: action })
        };
    } catch (error) {
        // --- Error Handling ---
        // Log any errors that occur during the S3 interaction to CloudWatch Logs.
        console.error('Error generating presigned URL:', error);
        // Return a 500 Internal Server Error response to the client.
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*', // CORS header
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: 'Failed to generate presigned URL.', error: error.message })
        };
    }
};