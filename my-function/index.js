const playwright = require("playwright-aws-lambda");

const fs = require("fs");
const path = require("path");
const axios = require("axios").default;
const FormData = require("form-data");

const JWT = `Bearer ${process.env.JWT}`;
const hostProfile = {
  description: "AirBnB Host Profile",
  external_url: "",
  name: "",
  image: "",
  Attributes: [],
};

const downloadImage = async (fileUrl, downloadFolder) => {
  const fileName = path.basename(fileUrl).split("?")[0];
  const localFilePath = path.resolve(__dirname, downloadFolder, fileName);

  try {
    const response = await axios({
      method: "GET",
      url: fileUrl,
      responseType: "stream",
    });
    await new Promise((resolve, reject) => {
      response.data
        .pipe(fs.createWriteStream(localFilePath))
        .on("finish", resolve)
        .on("error", reject);
    });
    console.log(`Successfully downloaded file: ${fileName}`);
  } catch (err) {
    console.error(`Error downloading file: ${err.message}`);
    console.error(err.stack);
    throw new Error(`Error downloading file: ${err.message}`);
  }
  return fileName;
};

const pinImageToIPFS = async (baseFileName) => {
  const formData = new FormData();
  const src = `/tmp/${baseFileName}`;
  let imageUrl = "";

  const file = fs.createReadStream(src);
  formData.append("file", file);

  const metadata = JSON.stringify({
    name: "File name",
  });
  formData.append("pinataMetadata", metadata);

  const options = JSON.stringify({
    cidVersion: 0,
  });
  formData.append("pinataOptions", options);

  try {
    const res = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      formData,
      {
        maxBodyLength: "Infinity",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${formData._boundary}`,
          Authorization: JWT,
        },
      }
    );
    console.log(res.data);

    imageUrl = res.data.IpfsHash;
  } catch (error) {
    console.error(`Error pinning ${baseFileName}: ${err.message}`);
    console.error(err.stack);
    throw new Error(`Error pinning ${baseFileName}: ${err.message}`);
  }
  return `ipfs://${imageUrl}`;
};

const pinJsonToIPFS = async (hostProfile) => {
  let cidJson = "";
  let profileData = JSON.stringify({
    pinataOptions: {
      cidVersion: 1,
    },
    pinataMetadata: {
      name: "testing",
      keyvalues: {
        customKey: "customValue",
        customKey2: "customValue2",
      },
    },
    pinataContent: hostProfile,
  });

  var config = {
    method: "post",
    url: "https://api.pinata.cloud/pinning/pinJSONToIPFS",
    headers: {
      "Content-Type": "application/json",
      Authorization: JWT,
    },
    data: profileData,
  };

  try {
    const res = await axios(config);
    console.log(res.data);
    cidJson = `ipfs://${res.data.IpfsHash}`;
  } catch (error) {
    console.error(`Error pinning Json: ${data}: ${err.message}`);
    console.error(err.stack);
    throw new Error(`Error pinning Json: ${data}: ${err.message}`);
  }

  return cidJson;
};
exports.handler = async (event, context) => {
  let browser = null;
  hostProfile.external_url = `https://www.airbnb.com/users/show/${event.queryStringParameters.hostid}`;
  let cidURL = "";

  try {
    browser = await playwright.launchChromium();
    const context = await browser.newContext();

    const page = await context.newPage();
    await page.goto(hostProfile.external_url);

    const extractName = async () => {
      const nameString = await page.getByText("Hi, I’m").textContent();
      return nameString.slice(8);
    };
    hostProfile.name = await extractName();

    const extractImage = async () =>
      await page.getByAltText("User Profile").first().getAttribute("src");
    hostProfile.image = await extractImage();

    const tab = await page.locator(
      "#tab--user-profile-review-tabs--0,#review-section-title"
    );

    const extractNumPages = async () => {
      const strReviews =
        (await tab.count()) > 1
          ? await tab.nth(1).textContent()
          : await tab.textContent();
      const pagesTotal = Math.ceil(parseInt(strReviews.match(/(\d+)/)) / 10);
      return pagesTotal;
    };
    const pages = await extractNumPages();

    const expandAllPages = async () => {
      const morePagesButtons = await page.locator("button._1dj2p4gk");
      for (let step = 0; step < pages - 1; step++) {
        await page.mouse.wheel(0, 4000);
        if (await morePagesButtons.isVisible()) {
          await morePagesButtons.click();
        }
      }
    };
    expandAllPages();

    const getAllReviews = async () => {
      const expandReviewButton = await page.locator(
        "#panel--user-profile-review-tabs--0 button._15rpys7s"
      );
      const hostReviews =
        (await tab.count()) > 1
          ? await page.locator(
              "div#panel--user-profile-review-tabs--0 div._1v365y9"
            )
          : page.locator("div._1v365y9");

      for (let step = 0; step < (await hostReviews.count()); step++) {
        if (await expandReviewButton.nth(step).isVisible()) {
          await expandReviewButton.nth(step).click();
        }
        const span = await hostReviews.nth(step).locator("span");
        const date = await span.nth(0).textContent();
        const review = await span.nth(1).textContent();
        const reviewItem = { date: date, review: review };
        hostProfile.Attributes.push(reviewItem);
      }
    };
    await getAllReviews();
    const baseFileName = await downloadImage(hostProfile.image, "/tmp");
    hostProfile.image = await pinImageToIPFS(baseFileName);
    cidURL = await pinJsonToIPFS(hostProfile);
    console.log(cidURL);
  } catch (error) {
    console.error(`Error: ${err.message}`);
    console.error(err.stack);
    throw new Error(`Error: ${err.message}`);
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
