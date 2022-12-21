const playwright = require('playwright-aws-lambda');

const fs = require('fs');
const path = require('path');
const axios = require('axios').default;
const FormData = require('form-data');

const JWT = 'Bearer '+process.env.JWT;
const hostProfile = {
  description: 'AirBnB Host Profile'
};

const downloadFile = async (fileUrl, downloadFolder) => {
  // Get the file name
  const fileName = path.basename(fileUrl).split('?')[0];

  // The path of the downloaded file on our machine
  const localFilePath = path.resolve(__dirname, downloadFolder, fileName);
  try {
    const response = await axios({
      method: 'GET',
      url: fileUrl,
      responseType: 'stream',
    });

    const w = response.data.pipe(fs.createWriteStream(localFilePath));
    w.on('finish', () => {
      console.log('Successfully downloaded file! '+fileName);
    });
  
  } catch (err) { 
    throw new Error(err);
  }
return fileName;
}; 


const pinFileToIPFS = async (baseFileName) => {
    const formData = new FormData();
    const src = "/tmp/"+baseFileName;
    
    const file = fs.createReadStream(src)
    formData.append('file', file)
    
    const metadata = JSON.stringify({
      name: 'File name',
    });
    formData.append('pinataMetadata', metadata);
    
    const options = JSON.stringify({
      cidVersion: 0,
    })
    formData.append('pinataOptions', options);

    try {
      const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
        maxBodyLength: "Infinity",
        headers: {
          'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
          Authorization: JWT
        }
      });
      console.log(res.data);
      hostProfile.image =  'ipfs://'+res.data.IpfsHash
      console.log(hostProfile.image)
    } catch (error) {
      console.log(error);
    }
}

const pinJsonToIPFS = async (hostProfile) => {
  var cidJson = '';
  var data = JSON.stringify({
    "pinataOptions": {
      "cidVersion": 1
    },
    "pinataMetadata": {
      "name": "testing",
      "keyvalues": {
        "customKey": "customValue",
        "customKey2": "customValue2"
      }
    },
    "pinataContent": hostProfile
  });
  
  var config = {
    method: 'post',
    url: 'https://api.pinata.cloud/pinning/pinJSONToIPFS',
    headers: { 
      'Content-Type': 'application/json', 
      'Authorization': JWT
    },
    data : data
  };
  
  try {
  const res = await axios(config);
  console.log(res.data);
  cidJson= 'ipfs://'+res.data.IpfsHash;
  } catch (error) {
  console.log(error);
  }
  
return cidJson;
  
}
exports.handler = async (event, context) => {
  let browser = null;
  hostProfile.external_url ='https://www.airbnb.com/users/show/'+event.queryStringParameters.hostid;
  let cidURL = '';

  try {
    browser = await playwright.launchChromium();
    const context = await browser.newContext();

    const page = await context.newPage();
    await page.goto(hostProfile.external_url);

    
   
    const extractName = async () => {
      const nameString = await page.getByText("Hi, I’m").textContent();
      return nameString.slice(8);
      }
    hostProfile.name = await extractName()

    const extractImage = async () => await page.getByAltText("User Profile").first().getAttribute('src')
    hostProfile.image = await extractImage()

    const tab = await page.locator('#tab--user-profile-review-tabs--0,#review-section-title')
    // Detect if multiple pages
    const extractNumPages = async () => { 
     const strReviews = (await tab.count()> 1) ? await tab.nth(1).textContent() : await tab.textContent()
     const pagesTotal = Math.ceil (parseInt(strReviews.match(/(\d+)/))/10);
     return pagesTotal
    }
    const pages = await extractNumPages()
    
    //Expand all pages
    const expandAllPages = async () => {
      const morePagesButtons = await page.locator('button._1dj2p4gk') 
      for (let step=0; step < (pages -1); step++){
        await page.mouse.wheel(0,4000)
        if (await morePagesButtons.isVisible()){ 
          await morePagesButtons.click()
        }
      }
    }
    expandAllPages()

   const getAllReviews = async () => {
    const expandReviewButton = await page.locator('#panel--user-profile-review-tabs--0 button._15rpys7s')
    const hostReviews = (await tab.count()>1) ? await page.locator('div#panel--user-profile-review-tabs--0 div._1v365y9') : page.locator('div._1v365y9')
    const reviewList = []
    hostProfile.Attributes = [];
   
    // Get All reviews
    for (let step = 0; step < (await hostReviews.count()); step++) {
      if (await expandReviewButton.nth(step).isVisible()) {
        await expandReviewButton.nth(step).click()
      }
      const span = await hostReviews.nth(step).locator('span')
      const date = await span.nth(0).textContent()
      const review = await span.nth(1).textContent()
      const reviewItem = {date: date, review: review}
      hostProfile.Attributes.push(reviewItem)
    }
  } 
    await getAllReviews()
    
    const baseFileName = await downloadFile(hostProfile.image, '/tmp')
    
    await pinFileToIPFS(baseFileName)
    cidURL = await pinJsonToIPFS(hostProfile)
    console.log(cidURL)

  } catch (error) {
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
  const response = {
    statusCode: 200,
    body: JSON.stringify(cidURL),
};
return response;
};