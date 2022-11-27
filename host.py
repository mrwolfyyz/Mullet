#!/usr/bin/env python3

import json
import math
import os
import re
import sys

import requests
from dotenv import load_dotenv

from playwright.sync_api import sync_playwright

host_url = sys.argv[1]
load_dotenv()
jwt_full = f"Bearer {os.environ['JWT']}"

host_profile = {}
host_profile['external_url'] = host_url
host_profile['description'] = 'Host Profile_NFT'



def get_name(page):
    name_str = page.get_by_text("Hi, I’m").text_content()
    host_profile['name'] = re.sub("Hi, I’m", '', name_str).lstrip()
    
      
def get_image(page):
    images = page.get_by_alt_text("User Profile")
    host_profile['image'] = images.first.get_attribute('src')

    
def get_num_pages(page):
        tab = page.locator('#tab--user-profile-review-tabs--0,#review-section-title')

        str_reviews = tab.nth(1).text_content() if tab.count()>1 else tab.text_content()
        
        nums_match = re.search(r'[0-9]+',str_reviews)
        num_reviews = int (nums_match.group())  
        num_pages = math.ceil(num_reviews/10)
        return num_pages

    
def display_all_pages(page,pages):
    expand_review_button=page.get_by_role("button", name="Show more reviews")
        
    for i in range(min(pages-1,47)):
        page.mouse.wheel(0,4000)
        expand_review_button.click()   

        
def expand_all_reviews(page):
    more_reviews_button = page.get_by_role("button", name="read more")
    page.mouse.wheel(0,-1000)
    num_buttons = more_reviews_button.count()
       
    for i in range(num_buttons):
        more_reviews_button.first.click()
        page.mouse.wheel(0,4000)
        
    page.mouse.wheel(0,-1000)

def get_all_reviews(page):
    
        tabs = page.locator('#tab--user-profile-review-tabs--0,#review-section-title')

        host_reviews = page.locator('div#panel--user-profile-review-tabs--0 div._1v365y9') if tabs.count()>1 else page.locator('div._1v365y9')
        
        review_list = []
          
        for i in range(host_reviews.count()):
            review_dict = {}
            review = host_reviews.nth(i).locator('span')
            review_dict['Date']=review.nth(0).text_content()
            review_dict['Content']=review.nth(1).text_content()
            review_list.append(review_dict)
            
        host_profile['attributes'] = review_list
        
def ipfs_pin_image():

    img = requests.get(host_profile['image']).content

    with open('local_image.jpeg', 'wb') as handler:
        handler.write(img)   
        
    url = "https://api.pinata.cloud/pinning/pinFileToIPFS"
    file = 'local_image.jpeg'

    payload={'pinataOptions': '{"cidVersion": 1}',
        'pinataMetadata': '{"name": "MyFile", "keyvalues": {"company": "Pinata"}}'}
    
    files=[
      ('file',(file,open(file,'rb'),'application/octet-stream'))
    ]
    
    headers = {
      'Authorization': jwt_full
    }

    response = requests.request("POST", url, headers=headers, data=payload, files=files)
    host_profile['image'] =f"ipfs://{response.json()['IpfsHash']}"

def pin_json():
    url = "https://api.pinata.cloud/pinning/pinJSONToIPFS"

    payload = json.dumps({
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
      "pinataContent": host_profile
    })
    headers = {
      'Content-Type': 'application/json',
      'Authorization': jwt_full
    }

    response = requests.request("POST", url, headers=headers, data=payload)

    # print(response.json()['IpfsHash'])
    print(response.text)

def main():

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(host_url)
               
        get_name(page)
        get_image(page)
     
        pages = get_num_pages(page)
        display_all_pages(page, pages)
        expand_all_reviews(page)
        
        get_all_reviews(page)
        
        browser.close()

    ipfs_pin_image() 
    pin_json()

   

if __name__ == "__main__":
    # calling the main function
    main()
