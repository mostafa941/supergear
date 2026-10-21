interface Config {
    baseUrl : string
}

const checkConfig = (server : string): Config =>{
    let baseUrl = ""
    switch (server) {
        case "production":
            baseUrl = "https://supergear-five.vercel.app"
            break;

        case "local":
            baseUrl = "http://localhost:8000"
            break;
    
        default:
            baseUrl = "https://supergear-five.vercel.app"
            break;
    }

    return {
        baseUrl: baseUrl.replace(/\/+$/, "")
    }
}

export const selectServer = "production"
export const config = checkConfig(selectServer)