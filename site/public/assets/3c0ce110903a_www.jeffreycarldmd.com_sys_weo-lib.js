//WEO JAVASCRIPT SUPPORT ROUTINES
//============================================================================================
//Copyright © 2011-2020 WEO MEDIA (TouchPoint Communications LLC). All rights reserved.
//   UNAUTHORIZED USE IS STRICTLY PROHIBITED
//   FOR QUESTIONS AND APPROPRIATE LICENSING PLEASE CONTACT WEO MEDIA
//   www.weomedia.com | info@weomedia.com
//
//   Some portions of code (modified and unmodified) have been included from public, 
//   or open source, sources and have been indicated as appropriate.
//
//	***** LIMITATION OF LIABILITY *****
//  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, 
//  INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR 
//  PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE 
//  LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, 
//  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE 
//  OR OTHER DEALINGS IN THE SOFTWARE.
//  ***********************************
//============================================================================================

var g_AdvEcid = 0;  
var g_AdvEuid = 0; 
var g_AdvEsrv = '';

function newWindowClickButtons(aBtnName){
	var insideBtn;
	var insideSpan;
	DebugLog('newWindowClickButtons - looking for buttons named['+ aBtnName +']');
	var pageBtns = GetDivsByClassList(document,'buttonwrapper');
	if(pageBtns){
		for ( const aBtn of pageBtns ) {
			insideBtn = aBtn.querySelector('a');
			if(insideBtn){
				insideSpan = insideBtn.querySelector('span');
				if(insideSpan){
					if( aBtnName.indexOf(insideSpan.textContent) == 0 && insideSpan.textContent.indexOf(aBtnName) == 0 ){
						DebugLog('newWindowClickButtons - a button found - IS A MATCH - jump to URL['+ insideBtn.href +']');
						goExt(insideBtn.href);
					}							
				}
			}
		}
	}
}


//----------------------------------------------------------------------------
function modifyIframeURL(parentElementID,aParam,aValue)  
{
	var theParent = document.getElementById(parentElementID);
	if(theParent){
		//DebugLog('modifyIframeURL - found parent element id['+parentElementID +']');
		var theFrame = theParent.getElementsByTagName('IFRAME')[0];
		if(theFrame){
			//DebugLog('modifyIframeURL - found first iframe inside parent['+ theFrame.title +'], src['+ theFrame.src +']');
			var newURL = updateURLParameter(theFrame.src,aParam,aValue);
			//DebugLog('modifyIframeURL - revised url['+ newURL +']');
			theFrame.src = newURL;
			//DebugLog('modifyIframeURL - new iFrame src['+ theFrame.src +']');
		}		
	}
}



function updateCNboxes(){
	var cnList = document.querySelectorAll('div[data-cns]');
	DebugLog('updateCNboxes - start number of CN items on page ['+ cnList.length +']');
	if(cnList.length > 0){
		DebugLog('doUpdateCNboxes - prep for do update CN items');
		setTimeout('doUpdateCNboxes()',2000);
	}
}

function doUpdateCNboxes(){
	var cnList = document.querySelectorAll('div[data-cns]');
	var cnStatus = 0;
	var cnID = '';
	DebugLog('doUpdateCNboxes - number of CN items on page ['+ cnList.length +']');
	if(cnList.length > 0){
		//DebugLog('doUpdateCNboxes - review CN items');
		var unprocCnt = 0;
		for ( const aDiv of cnList ) {
			cnID = aDiv.id;
			cnStatus = aDiv.getAttribute('data-cns');
			//DebugLog('doUpdateCNboxes - see div ID ['+ cnID +'] with status['+ cnStatus +']');
			if( cnStatus == 0 ) {
				if( isVisible(aDiv) ){
					DebugLog('doUpdateCNboxes - see div ID ['+ cnID +'] is visible');
					
					DebugLog('doUpdateCNboxes - calling doProcessTableCallback');
					var cnAction = 'process/doProcess-CN.asp?CNT='+ aDiv.getAttribute('data-cnt') +'&CNCID='+aDiv.getAttribute('data-cncid');
					if(aDiv.getAttribute('data-cnrid')) cnAction = cnAction + '&CNRID='+aDiv.getAttribute('data-cnrid');
					if(aDiv.getAttribute('data-cnpin')) cnAction = cnAction + '&CNPIN='+aDiv.getAttribute('data-cnpin');
					if(aDiv.getAttribute('data-alon')) cnAction = cnAction + '&ALON='+aDiv.getAttribute('data-alon');
					if(aDiv.getAttribute('data-alid')) cnAction = cnAction + '&ALID='+aDiv.getAttribute('data-alid');
					if(aDiv.getAttribute('data-alfn')) cnAction = cnAction + '&ALFN='+aDiv.getAttribute('data-alfn');
					cnAction = AddInterfaceLevelToURL(cnAction);
					DebugLog('doUpdateCNboxes - about to process CN action['+ cnAction +']');
					doProcessDiv(cnID,cnAction,doProcessCNCallback,12000);
					aDiv.setAttribute('data-cns',1); 
				}else{
					unprocCnt++;
				}
			}
		}
		if( unprocCnt > 0 ) {
			DebugLog('doUpdateCNboxes - still ['+ unprocCnt +'] unprocessed CN divs on page');
			setTimeout('doUpdateCNboxes()',3000);
		}else{
			DebugLog('doUpdateCNboxes - no more unprocessed CN divs on page');
		}
	}
}


//USE CallbackResult OBJECT TO PARSE RETURN FROM CALLBACKS IN doProcess - HEADER FORMAT IS [OK:rows[~]###[~]total[~]####[~]done[~]1]other stuff here		
function CallbackResult(aElementID,aReturnContent,aReturnMessage){
	this.elementID = aElementID;
	this.status = 'unknown';  //OK, TIMEOUT, AUTHENTICATION, ERROR, or OTHER - look at rawReturn and rawMessage for ERROR and OTHER
	this.errMsg = '';
	this.rawReturn = aReturnContent;
	this.rawMessage = aReturnMessage;
	this.doneFlag = 0;  //SET TO 1 IF THE HEADER WAS BUILT NORMALLY
	this.contentStr = '';
	this.headerArr = null;
	//USE getHeaderValue TO READ HEADER FIELD VALUES
	this.getHeader = getHeaderValue;
	
	DebugLog('CallbackResult - START - aElementID['+ aElementID +'], aReturnContent['+ aReturnContent +'], aReturnMessage['+ aReturnMessage +']');
	
	function getHeaderValue(aHeaderField){
		if(this.doneFlag > 0){
			if(this.headerArr){
				var headValue = getParsedItem(aHeaderField,this.headerArr);
				return headValue;
			}else{
				return '';
			}
		}else{
			return '';
		}
	}
	
	if(aReturnMessage.includes('Error')){
		this.status = 'ERROR';
		this.errMsg = retMessage;
	}else{
		// RETMSG FORMAT INCLUDES SOME INFO, PARSE WITH getParsedData AND getParsedItem
		//[OK:rows[~]###[~]total[~]####[~]done[~]1]<tr>....</tr>
		if(aReturnContent.substr(0,4).includes('[OK:')){
			DebugLog('CallbackResult - is OK and we have prefixed data');
			this.status = 'OK';
			var dataStr;
			if(aReturnContent.search(']<') > 0){
				dataStr = aReturnContent.substring(0,aReturnContent.search(']<'));
			}else{
				dataStr = aReturnContent.substring(0,aReturnContent.lastIndexOf(']'));
			}
			DebugLog('CallbackResult - raw data string ['+ dataStr + ']');
			var dataStrLen = dataStr.length;
			dataStr = dataStr.substring(4,dataStrLen);
			//DebugLog('CallbackResult - fixed data string ['+ dataStr + ']');
			
			this.contentStr = aReturnContent.substring(dataStrLen+1,aReturnContent.length);
			DebugLog('CallbackResult - contentStr ['+ this.contentStr + ']');
			this.headerArr = getParsedData(dataStr);
			
			this.doneFlag = getParsedItem('done',this.headerArr);
			DebugLog('CallbackResult - done flag ['+ this.doneFlag +']');	
			
		}else{

			DebugLog('CallbackResult - some other response from the system:['+ aReturnContent.slice(0,150) +']');
			if(aReturnContent.indexOf('Timeout:') >= 0){
				DebugLog('CallbackResult - response: TIMED OUT');
				this.status = 'TIMEOUT';
				this.errMsg = 'The callback timed out.';
			}else if(aReturnContent.indexOf('[interface process authentication error') >= 0){
				DebugLog('CallbackResult - response: AUTHENTICATION FAILURE');
				this.status = 'AUTHENTICATION';
				this.errMsg = 'The authorization to run the callback failed.';
			}else if(aReturnMessage.indexOf('Timeout:') >= 0){
				DebugLog('CallbackResult - response message says: TIMED OUT');
				this.status = 'TIMEOUT';
				this.errMsg = 'The callback timed out.';
			}else{
				DebugLog('CallbackResult - response: UNHANDLED MESSAGE/CONTENT');
				this.status = 'OTHER';
				this.errMsg = 'The callback returned some unhandled result type.';
			}	
		}
	}
}


//----------------------------------------------------------------------------
function doProcessCNCallback(retID,retContent,retMessage){

	DebugLog('doProcessCNCallback - id['+ retID +'], message['+ retMessage +'], len content['+ retContent.length +']');

	DebugLog('doProcessCNCallback - content['+ retContent +']');
	
	var theDiv = document.getElementById(retID);
	if(theDiv){
		DebugLog('doProcessCNCallback - found CN item on page');
		theDiv.setAttribute('data-cns',2); 
		
		var cbResult = new CallbackResult(retID,retContent,retMessage);
		
		DebugLog('doProcessCNCallback - cbResult - status['+ cbResult.status +']');
		if(cbResult.status == 'OK'){
			DebugLog('doProcessCNCallback - cbResult - note count['+ cbResult.getHeader('notecount') +']');
			DebugLog('doProcessCNCallback - cbResult - action count['+ cbResult.getHeader('actioncount')  +']');
			if((cbResult.getHeader('notecount') > 0) || (cbResult.getHeader('actioncount') > 0)){	
				DebugLog('doProcessCNCallback - cbResult - show notes icon');
				if(cbResult.getHeader('notecount') > 0){
					if(cbResult.getHeader('actioncount') > 0){
						theDiv.style.backgroundImage = 'url(images/icon-sm-note-plus.png)';
					}else{
						theDiv.style.backgroundImage = 'url(images/icon-sm-note.png)';
					}
				}else{
					theDiv.style.backgroundImage = 'url(images/icon-time.png)';
				}
				theDiv.title = 'This item has '+ cbResult.getHeader('notecount') +' associated notes and '+ cbResult.getHeader('actioncount') +' associated actions.';
				
				var cnAction = 'process/doProcess-CN.asp?CNT='+ theDiv.getAttribute('data-cnt') +'&CNCID='+theDiv.getAttribute('data-cncid') 
				if(theDiv.getAttribute('data-cnpin')) cnAction = cnAction +'&CNPIN='+theDiv.getAttribute('data-cnpin');
				if(theDiv.getAttribute('data-cnrid')) cnAction = cnAction +'&CNRID='+theDiv.getAttribute('data-cnrid');
				if(theDiv.getAttribute('data-alon')) cnAction = cnAction +'&ALON='+theDiv.getAttribute('data-alon');
				if(theDiv.getAttribute('data-alid')) cnAction = cnAction +'&ALID='+theDiv.getAttribute('data-alid');
				if(theDiv.getAttribute('data-alfn')) cnAction = cnAction +'&ALFN='+theDiv.getAttribute('data-alfn');
				cnAction = cnAction + '&CNVW=1';
				cnAction = AddInterfaceLevelToURL(cnAction);
				var theIframeURL = cnAction;
				var boxContent = '<div data-dlf=1 data-dlfurl="'+ theIframeURL +'" data-dlfmsg="loading notes and actions list..." data-dlfw="400px" data-dlfh="200px" style="display:block;position:relative;width:auto;height:auto;"></div>';		

				var thehbID = 'hb' + (1000000 + Math.floor(Math.random()*8999999)); 
				var theInside = '<div class="tribox left boxshadow">'+ boxContent +'</div>'
				var theHbox = '<div id='+ thehbID +' data-hbPos="1" class="hoverinfoRight">'+ theInside +'</div><button data-hoverbubble='+ thehbID +' class="hoverinfobtn" style="background-color:transparent;border:none;">&nbsp;</button>';
				var theNewHTML = '<div class="hoverboxRight">'+ theHbox +'</div>';
				theDiv.innerHTML = theNewHTML;
				
				//now add our event listeners to this new hoverbubble item
				var hbList = theDiv.querySelectorAll('button[data-hoverbubble]');
				hbList.forEach(item => {item.addEventListener('mouseover',hbOver,false); })
				hbList.forEach(item => {item.addEventListener('mouseout',hbOut,false); })
				var hbBoxes = theDiv.querySelectorAll('div[data-hbPos]');
				hbBoxes.forEach(item => {item.addEventListener('mouseover',hbBoxOver,false); })
				hbBoxes.forEach(item => {item.addEventListener('mouseout',hbBoxOut,false); })
				
				dlCheckList(); // also need to check the dlfurl for the iframe
			}else if((cbResult.getHeader('notecount') == 0) && (cbResult.getHeader('actioncount') == 0)){
				DebugLog('doProcessCNCallback - cbResult - no notes - just update text');
				theDiv.style.backgroundImage = 'url(images/icon-check.png)';
				theDiv.style.opacity = 0.3;
				theDiv.title = 'This item has no associated notes or actions';
			}
		}else{
			DebugLog('doProcessCNCallback - cbResult - some other status['+ cbResult.status +'] errMsg['+ cbResult.errMsg +']');
			if(theDiv.cnTryCnt > 10){
				DebugLog('doProcessCNCallback - cbResult - exceeded TRY COUNT ['+ theDiv.cnTryCnt +'], set red flag');
				theDiv.style.backgroundImage = 'url(images/redflag.gif)';
				theDiv.title = 'An error occured while attempting to look for associated notes and actions';
			}else if(theDiv.cnTryCnt <= 10){
				theDiv.cnTryCnt = theDiv.cnTryCnt + 1;
				DebugLog('doProcessCNCallback - cbResult - TRY COUNT ['+ theDiv.cnTryCnt +']');
				theDiv.setAttribute('data-cns',0); //RESET SO IT WILL TRY AGAIN
				doUpdateCNboxes();
			}else{
				theDiv.cnTryCnt = 1;
				DebugLog('doProcessCNCallback - cbResult - first TRY COUNT ['+ theDiv.cnTryCnt +']');
				theDiv.setAttribute('data-cns',0); //RESET SO IT WILL TRY AGAIN
				doUpdateCNboxes();
			}
		}
	
	}else{
		DebugLog('doProcessCNCallback - error - didnt find the CN item on page');
	}
}


//----------------------------------------------------------------------------
function isVisible(elem) {
	if (!(elem instanceof Element)) throw Error('This item is not an element.');
	const style = getComputedStyle(elem);
	if (style.display === 'none') return false;
	if (style.visibility !== 'visible') return false;
	if (style.opacity < 0.1) return false;
	if (elem.offsetWidth + elem.offsetHeight + elem.getBoundingClientRect().height +
			elem.getBoundingClientRect().width === 0) {
			return false;
	}
	const elemCenter   = {
			x: elem.getBoundingClientRect().left + elem.offsetWidth / 2,
			y: elem.getBoundingClientRect().top + elem.offsetHeight / 2
	};
	if (elemCenter.x < 0) return false;
	if (elemCenter.x > (document.documentElement.clientWidth || window.innerWidth)) return false;
	if (elemCenter.y < 0) return false;
	if (elemCenter.y > (document.documentElement.clientHeight || window.innerHeight)) return false;
	let pointContainer = document.elementFromPoint(elemCenter.x, elemCenter.y);
	do {
			if (pointContainer === elem) return true;
			if (!pointContainer) return false;
	} while (pointContainer = pointContainer.parentNode);
	return false;
}


//----------------------------------------------------------------------------
function setDataAttributeByName(elementName,aDataName,aDataValue){
var ta = document.getElementsByName(elementName)[0];
	if(ta){
		ta.setAttribute(aDataName) = aDataValue;
	}
}

//----------------------------------------------------------------------------
function getDataAttributeByName(elementName,aDataName){
var ta = document.getElementsByName(elementName)[0];
	if(ta){
		return ta.gettAttribute(aDataName);
	}else{
		return '';
	}
}
//----------------------------------------------------------------------------
function setDataAttributeById(elementID,aDataName,aDataValue){
var ta = document.getElementById(elementID);
	if(ta){
		ta.setAttribute(aDataName) = aDataValue;
	}
}

//----------------------------------------------------------------------------
function getDataAttributeById(elementID,aDataName){
var ta = document.getElementById(elementID);
	if(ta){
		return ta.gettAttribute(aDataName);
	}else{
		return '';
	}
}

function initAdv(){
	var advList = document.querySelectorAll('table[data-ai]');
	DebugLog('initAdv - number of ai items on page ['+ advList.length +']');
	if(advList.length > 0){
		advList.forEach(item => {item.addEventListener('mouseover',advOver,false); })
		advList.forEach(item => {item.addEventListener('mouseout',advOut,false); })
		advList.forEach(item => {item.addEventListener('click',advClick,false); })
		var advDivBoxes = document.querySelectorAll('div[data-ai]');
		advDivBoxes.forEach(item => {item.addEventListener('mouseover',advOver,false); })
		advDivBoxes.forEach(item => {item.addEventListener('mouseout',advOut,false); })
		advDivBoxes.forEach(item => {item.addEventListener('click',advClick,false); })
	}
}


function advOver(e)
{ 
	if(e){
		var doCP = false;
		var theElm = e.currentTarget;
		if(theElm){
			var advItemID = theElm.getAttribute('data-ai');

			//DebugLog('advOver - advItemID is ['+ advItemID +']');
			theElm.style.borderStyle = "dashed";
			theElm.style.borderWidth = "2px";
			theElm.style.borderColor = "#00EE00";
			theElm.style.boxSizing = "border-box";
			//theElm.style.cursor = "pointer";
			
			var boxName = 'ntai'+ advItemID;
			var subBoxName = 'ntais'+ advItemID;
			var boxNote = '<div id="'+ boxName +'" style="display:inline-block;position:relative;vertical-align:top;"><div id="'+ subBoxName +'" style="display:block;position:absolute;top:0;left:0;cursor:pointer;width:auto;min-width:180px;min-height:18px;border:2px solid #0f0;background-color:#cfc;color:#0a0;font-size:10pt;white-space:pre;padding:4px;line-height:18px;z-index:1000;">article: ai'+ advItemID +' <span style="font-size:8pt">click to edit</span></div></div>';
			
			if(theElm.innerHTML.indexOf(boxName) == -1){ 
				if(theElm.nodeName == 'TABLE'){
					var theBody = theElm.getElementsByTagName('TBODY')[0];
					if(theBody){
						theBody.innerHTML = '<tr><td style="height:0;line-height:0;">' + boxNote + '</td></tr>' + theBody.innerHTML;
					}
				}else{
					theElm.innerHTML = boxNote + theElm.innerHTML;
				}
			}else{
				var boxElm = document.getElementById(boxName);
				if(boxElm){
					boxElm.style.display = 'inline-block';
				}
			}
		}
	}
}

function advOut(e)
{  
	if(e){
		var theElm = e.currentTarget;
		if(theElm){
			var advItemID = theElm.getAttribute('data-ai');

			//DebugLog('advOut - advItemID is ['+ advItemID +']');
			theElm.style.borderStyle = "solid";
			theElm.style.borderWidth = "0";
			theElm.style.borderColor = "";		
			theElm.style.boxSizing = "content-box";		
			theElm.style.cursor = "";
			
			var boxName = 'ntai'+ advItemID;
			if(theElm.innerHTML.indexOf(boxName) > -1){ 
				//DebugLog('advOut - boxname ['+ boxName +'] is there');
				var boxElm = document.getElementById(boxName);
				if(boxElm){
					//DebugLog('advOut - found boxname ['+ boxName +'] element');
					boxElm.style.display = 'none';
				}
			}
		}
	}
}


function advClick(e)
{  
	if(e){
		var theElm = e.currentTarget;
		if(theElm){
			var advItemID = theElm.getAttribute('data-ai');
			var subBoxID = 'ntais'+ advItemID;
			if(isMouseInElement(subBoxID)){
				//DebugLog('advClick - g_AdvEcid ['+ g_AdvEcid +'], g_AdvEuid ['+ g_AdvEuid +'], advItemID ['+ advItemID +']');
				//theElm.style.borderStyle = "solid";
				var chkv = Number(g_AdvEcid) + Number(g_AdvEuid) + Number(advItemID) + 5;
				var thePage = 'https://'+ g_AdvEsrv +'/sys/action.asp?T=ADVA1&CID='+ g_AdvEcid +'&UID='+ g_AdvEuid +'&AA=5&AP=&AN=&AAX=1&AAU='+chkv+'&ADVAP='+advItemID;
				//DebugLog('advClick - action thePage ['+ thePage +']');
				goExt(thePage);					
			}
		}
	}
}




function initHB(){
	var hbList = document.querySelectorAll('button[data-hoverbubble]');
	DebugLog('initHB - number of HB items on page ['+ hbList.length +']');
	if(hbList.length > 0){
		hbList.forEach(item => {item.addEventListener('mouseover',hbOver,false); })
		hbList.forEach(item => {item.addEventListener('mouseout',hbOut,false); })
		var hbBoxes = document.querySelectorAll('div[data-hbPos]');
		hbBoxes.forEach(item => {item.addEventListener('mouseover',hbBoxOver,false); })
		hbBoxes.forEach(item => {item.addEventListener('mouseout',hbBoxOut,false); })
	}

	setTimeout(dlCheckList,2000);
}


// OPTIONAL PARAMS FOR DYN LOAD FRAMES - data-dlfmsg="loading..." data-dlfw="600px" data-dlfh="400px"
function dlCheckList()
{ 
	var dlList = document.querySelectorAll('div[data-dlf]');
	//DebugLog('initHB - number of DL items on page ['+ dlList.length +']');
	if(dlList.length > 0){
		dlList.forEach(item => {dlCheckOne(item);})
		setTimeout(dlCheckList,500);
	}
}

function dlCheckOne(aDiv)
{ 
	var theWidth = '100%';
	var theHeight = '100%';
	if(aDiv){
		if(aDiv.offsetParent === null){
			//
		}else{
			var dfURL = aDiv.getAttribute('data-dlfurl');
			if(dfURL){
				if(aDiv.innerHTML.length > 0){
					// 'THERE IS SOMETHING THERE NOW, SO NO NEED TO DO ANYTHING
				}else{
					if(aDiv.getAttribute('data-dlfw')){
						theWidth = aDiv.getAttribute('data-dlfw');
					}
					if(aDiv.getAttribute('data-dlfh')){
						theHeight = aDiv.getAttribute('data-dlfh');
					}					
					if(aDiv.getAttribute('data-dlfpic') == 1){
						var thePic = '<img src="'+dfURL+'" style="width:'+ theWidth +';height:'+ theHeight +';object-fit:cover;object-position:50% 50%;"">';
						aDiv.innerHTML = thePic;
					}else if(aDiv.getAttribute('data-dlfcd') >= 1){
						var theCall = dfURL + '&PBC='+ aDiv.getAttribute('data-dlfcd'); 
						var theInnerDivID = 'dlc' + Math.floor(Math.random()*10000);
						var theInnerDiv = '<div id="'+ theInnerDivID +'"><div>&nbsp;</div></div>';
						aDiv.innerHTML = theInnerDiv; 
						MakeSpinnerInElement(theInnerDivID,4,4,12,'#00F',1);
						doProcessDiv(theInnerDivID,theCall,doProcessOneCallback,10000); //doProcessDiv(aDivID,aProcessURL,aReturnCallback,timeoutMS)
					}else if(aDiv.getAttribute('data-dlfmsg').length > 0){
						DebugLog('dyn load frame message content and doing iframe with url['+ dfURL +']');
						var theInnerDivID = 'dlc' + Math.floor(Math.random()*10000);
						var theBoxDivID = theInnerDivID + 'box';
						var theIFrmID = theInnerDivID + 'frame';
						var theInnerDiv = '<div id="'+ theInnerDivID +'" style="margin-left:auto;margin-right:auto;margin-top:6px;width:78px"><div>&nbsp;</div></div>';
						aDiv.innerHTML = '<div id="'+ theBoxDivID +'" style="font-weight:normal;font-style:italic;font-color:#999;text-align:center;">'+ aDiv.getAttribute('data-dlfmsg') + theInnerDiv +'</div>';
						MakeSpinnerInElement(theInnerDivID,4,4,12,'#00F',1);					
						var theFrame = '<iframe id='+ theIFrmID +' src="'+dfURL+'" style="width:'+ theWidth +';height:'+ theHeight +';" frameBorder="0" marginheight="0px" marginwidth="0px" allowfullscreen></iframe>';
						aDiv.innerHTML = aDiv.innerHTML + theFrame;
						setTimeout('checkForIframeFinished("'+	theInnerDivID +'")',200);						
						
					}else{
						DebugLog('doing iframe with url['+ dfURL +']');
						var theFrame = '<iframe src="'+dfURL+'" style="width:'+ theWidth +';height:'+ theHeight +';overflow:hidden;" frameBorder="0" scrolling="no" marginheight="0px" marginwidth="0px" allowfullscreen></iframe>';
						aDiv.innerHTML = theFrame;
					}
				}
			}
		}
	}
}

function checkForIframeFinished(baseFrameID){
	var theframeID = baseFrameID + 'frame';
	var theBoxID = baseFrameID + 'box';
	var theIframe = document.getElementById(theframeID);
	if(theIframe){
		if(theIframe.isSpinningState == 1){
			DebugLog('checkForIframeFinished - iframe is currently spinning');
			var theIframeDoc = theIframe.contentDocument || theIframe.contentWindow.document;
			
			// Check if loading is complete
			if( theIframeDoc.readyState  == 'complete' ){
				//DebugLog('checkForIframeFinished - iframe complete - iframe height['+ theIframe.clientHeight +'], iframe length['+ theIframeDoc.body.innerHTML.length +']');
				
				//if(theIframeDoc.contentWindow){
				if(theIframeDoc.body.innerHTML.length > 0){
					//DebugLog('checkForIframeFinished - iframe has content now');
				//	theIframeDoc.contentWindow.onload = function(){
						DebugLog('checkForIframeFinished - it is loaded, clear the spinner and loading message');
						var theInnerBox = document.getElementById(theBoxID);
						if(theInnerBox){
							theInnerBox.innerHTML = '';
							theInnerBox.style.display = 'none';
						}
						theIframe.isSpinningState = 2;
				//	};

				}else{
					//DebugLog('checkForIframeFinished - set iframe is not complete');
					setTimeout('checkForIframeFinished("'+ baseFrameID +'")',500);	
				}
			}else{ 
				DebugLog('checkForIframeFinished - set iframe is not complete');
				setTimeout('checkForIframeFinished("'+ baseFrameID +'")',500);	
			}
		}else{
			if(theIframe.isSpinningState == 2){
				// done
				//DebugLog('checkForIframeFinished - set iframe is done loading and spinning finished');
			}else{
				theIframe.isSpinningState = 1;
				//DebugLog('checkForIframeFinished - set iframe is spinning');
				setTimeout('checkForIframeFinished("'+ baseFrameID +'")',100);	
			}
		}
	}
}

//----------------------------------------------------------------------------
function doProcessOneCallback(retID,retContent,retMessage){

	DebugLog('doProcessOneCallback - id['+retID+'], message['+retMessage+'], len content['+retContent.length+']');
	//DebugLog('doProcessOneCallback - content['+retContent+']');

	var theDiv = document.getElementById(retID);
	if(theDiv){
		DebugLog('doProcessOneCallback - found div on page');
		//[OK:RETURNED CONTENT HERE] OR //[ERR:THE ERROR MESSAGE HERE]
		if(retContent.substr(0,4).includes('[OK:')){
			DebugLog('doProcessOneCallback - OK, we have prefixed data');
			var dataStr;
			dataStr = retContent.substring(0,retContent.lastIndexOf(']'));
			var dataStrLen = dataStr.length;
			dataStr = dataStr.substring(4,dataStrLen);
			DebugLog('doProcessOneCallback - raw data string [ '+ dataStr +' ]');
			theDiv.innerHTML = dataStr;
		}else{
			DebugLog('doProcessOneCallback - looks like we have error info');
			theDiv.innerHTML = retContent;
		}
	}	
}



function hbOver(e)
{ 
	if(e){
		var doCP = false;
		var theElm = e.currentTarget;
		if(theElm){
			var hbItemID = theElm.getAttribute('data-hoverbubble');
			var thePos = getOffset(theElm);
			var elmW = theElm.clientWidth;
			var elmH = theElm.clientHeight;
			//DebugLog('hbOver - hbID is ['+ hbItemID +'], page left['+ thePos.left +'], page top['+ thePos.top +']');
			var hBox = document.getElementById(hbItemID);
			if(hBox){
				var aPosNum = hBox.getAttribute('data-hbPos');
				//DebugLog('hbOver - current hBox display is ['+ hBox.style.display +'], hbPos['+ aPosNum +'], elmWidth['+ elmW +'], elmHeight['+ elmH +']');
				//DebugLog('hbOver - current hBox width['+ hBox.clientWidth +'], height['+ hBox.clientHeight +']');
				if(hBox.style.display = 'none'){doCP = true;}
				hBox.style.display = 'block';
				hBox.hbButton = 1;

				if(doCP){
					//DebugLog('hbOver - SETTING CHECK POS TIMEOUT');
					setTimeout(hbCheckPos,1,theElm,1);
				}
			}
		}
	}
}

function hbCheckPos(theElm,theRefresh)
{ 
	//DebugLog('hbCheckPos - start - theRefresh['+ theRefresh +']');

	if(theElm){
		var hbItemID = theElm.getAttribute('data-hoverbubble');
		//var theOffset = getOffset(theElm);
		var thePos = theElm.getBoundingClientRect();
		var elmW = theElm.clientWidth;
		var elmH = theElm.clientHeight;
		var boxWidth = 0;
		var boxHeight = 0;
		//DebugLog('hbCheckPos - hbID is ['+ hbItemID +'], page left['+ thePos.left +'], page top['+ thePos.top +']');
		var hBox = document.getElementById(hbItemID);
		if(hBox){
			var aPosNum = hBox.getAttribute('data-hbPos');
			//DebugLog('hbCheckPos - current hBox - id['+ hBox.id +'], display is ['+ hBox.style.display +'], hbPos['+ aPosNum +']');
			//DebugLog('hbCheckPos - current hBox - clientWidth['+ hBox.clientWidth +'], hbWidth['+ hBox.hbWidth +'] - clientHeight['+ hBox.clientHeight +'], hbHeight['+ hBox.hbHeight +']');
			if(hBox.hbWidth > 0){
				if(hBox.clientWidth && hBox.clientWidth > hBox.hbWidth){
					boxWidth = hBox.clientWidth;
					hBox.hbWidth = boxWidth;
				}else{
					boxWidth = hBox.hbWidth;
				}
			}else{boxWidth = hBox.clientWidth;hBox.hbWidth = boxWidth;}
			if(hBox.hbHeight > 0){boxHeight = hBox.hbHeight;}else{boxHeight = hBox.clientHeight;hBox.hbHeight = boxHeight;}
			//DebugLog('hbCheckPos - using - boxWidth['+ boxWidth +'], boxHeight['+ boxHeight +']');
			if(hBox.style.display == 'block'){
				if(aPosNum == 1){
					//DebugLog('hbCheckPos - doing position Right');
					//DebugLog('hbCheckPos - using - rect left['+ thePos.left +'], rect top['+ thePos.top +']');
					//DebugLog('hbCheckPos - using - theOffset left['+ theOffset.left +'], theOffset top['+ theOffset.top +']');
					hBox.style.left = (thePos.left + elmW) + 'px'; // right of the element
					hBox.style.top =  ( thePos.top + ((elmH/2) - 26) )  + 'px'; 	
				}else if(aPosNum == 2){
					//DebugLog('hbCheckPos - doing position Top');
					hBox.style.left = ( thePos.left + ((elmW/2) - 45) )  + 'px'; // top of the element
					hBox.style.top =  ( thePos.top - (boxHeight + 15) )  + 'px'; 				
				}else if(aPosNum == 3){
					//DebugLog('hbCheckPos - doing position Bottom');
					hBox.style.left = ( thePos.left + ((elmW/2) - 45) ) + 'px'; // bottom of the element
					hBox.style.top =  ( thePos.top + elmH + 15 ) + 'px'; 
				}else if(aPosNum == 4){
					//DebugLog('hbCheckPos - doing position Left');
					hBox.style.left = ( thePos.left - (boxWidth) ) + 'px'; // left of the element
					hBox.style.top =  ( thePos.top + ((elmH/2) - 26) )  + 'px'; 
				}
				
				setTimeout(hbCheckPos,100,theElm,100);
			}	
		}
	}
}

function hbOut(e)
{  
	if(e){
		var theElm = e.currentTarget;
		if(theElm){
			var hbItemID = theElm.getAttribute('data-hoverbubble');
			//var thePos = getOffset(theElm);
			//var elmW = theElm.clientWidth;
			//var elmH = theElm.clientHeight;
			//DebugLog('hbOut - hbID is ['+ hbItemID +'], page left['+ thePos.left +'], page top['+ thePos.top +']');
			var hBox = document.getElementById(hbItemID);
			if(hBox){
				//DebugLog('hbOut - hbID is ['+ hbItemID +'] - setting timer');
				hBox.hbButton = 0;
				setTimeout('hbCheckForOut("'+hbItemID+'")',200);
			}
		}
	}
}

function hbCheckForOut(hbItemID)
{  
	//DebugLog('hbCheckForOut - start - hbItemID['+ hbItemID +']');
	if(hbItemID){
		var hBox = document.getElementById(hbItemID);
		if(hBox){
			//DebugLog('hbCheckForOut - current hBox display is ['+ hBox.style.display +'], hbHold['+ hBox.hbHold +'],  hbButton['+ hBox.hbButton +']');
			if((hBox.hbHold == 1) || (hBox.hbButton == 1)){
				//DebugLog('hbCheckForOut - keep open');
				setTimeout('hbCheckForOut("'+hbItemID+'")',200);
			}else{
				//DebugLog('hbCheckForOut - hide now');
				hBox.style.display = 'none';
			}
		}
	}
}


function hbBoxOver(e)
{ 
	if(e){
		var hBox = e.currentTarget;
		if(hBox){
			hBox.hbHold = 1;
		}
	}
}

function hbBoxOut(e)
{  
	if(e){
		var hBox = e.currentTarget;
		if(hBox){
			hBox.hbHold = 0;
			hbOut(e);
		}
	}
}








function WEOcnLaunch(){
	DebugLog('WEOcnLaunch - START');
	setTimeout('CNweo()',3000);
}


function CNweo(){
	DebugLog('CNweo - TRIGGERED');
	var chkArr = document.getElementsByClassName('tpCN');
	var chkElm;
	var matchVal = false;
	var dataItem = '';
	var textItem = '';
	if(chkArr){
		//var actionURL = '';
		for(var i = 0; i < chkArr.length; i++) {
			chkElm = chkArr[i];
			if(chkElm){
				matchVal = false;
				dataItem = chkElm.getAttribute('data-cn');
				textItem = chkElm.innerHTML;
				if(dataItem.match(textItem)){
					matchVal = true;
				}else{
					matchVal = false;
				}
				DebugLog('CNweo - check element ['+ i +'] - data['+ dataItem +'], text['+ textItem +'], match['+ matchVal +']');
				
				//TODO: IMPLEMENT CALLBACK TO STORE THE RESULTS
				
				//actionURL = 'rel:'+ GetPathRelToSys() + 'process/doProcess-FavAction.asp?C='+aClientID+'&UID='+aUserID+'&FT='+aFavType+'&FI='+aFavItemID+'&FA='+actionID;
				//ProcessAction(actionURL,'','');
			}
		}
	}	
	DebugLog('CNweo - FINISHED');	
}

function doProcess(aProcessURL,aReturnCallback,timeoutMS){
	doProcessAux('',aProcessURL,aReturnCallback,timeoutMS,0,0);
}

function doProcessDiv(aDivID,aProcessURL,aReturnCallback,timeoutMS){
	doProcessAux(aDivID,aProcessURL,aReturnCallback,timeoutMS,0,0);
}

function doProcessDivEx(aDivID,aProcessURL,aReturnCallback,timeoutMS,firstLoad,refresh){
	doProcessAux(aDivID,aProcessURL,aReturnCallback,timeoutMS,firstLoad,refresh);
}

var gProcessInterfaceLevel = 0;
var gProcessSessCheck = 0;

function doProcessAux(aElementID, aProcessURL, aReturnCallback, timeoutMS, firstLoad, refresh) {
  var httpObj = new XMLHttpRequest();
	var theURL = ''
	var countNum = 0;
	var theCount = '';
	var theSeconds = '';
	var isFirstTime = true;
	var thetimeout = timeoutMS;
	if(thetimeout == 0){thetimeout = 2000;}
	

	DebugLog('doProcess - START - id['+aElementID+'], url['+aProcessURL+'], timeout['+timeoutMS+'], firstLoad['+firstLoad+'], refresh['+refresh+']');
  if(aReturnCallback){
		httpObj.callback = aReturnCallback;
	}else{
		httpObj.callback = defaultdoProcessCallback;
	}
	httpObj.firstLoad = firstLoad;
	httpObj.refresh = refresh;
	httpObj.startURL = aProcessURL;
	httpObj.elmID = aElementID;
	if(aElementID){
		var theElem = document.getElementById(aElementID);
		if(theElem){
			if(theElem.getAttribute('dpCount')){
				countNum = parseInt(theElem.getAttribute('dpCount')) + 1;
				theElem.setAttribute('dpCount',countNum);
				isFirstTime = false;
			}else{
				theElem.setAttribute('dpCount',1);
				countNum = 1;
			}
			theCount = '&IC='+countNum;
			
			if(theElem.getAttribute('dpStart')){
				var sTime = parseInt(theElem.getAttribute('dpStart'));
				var d = new Date();
				var n = d.getTime(); 
				var sdiff = parseInt(n/1000) - sTime;
				theSeconds = '&N='+sdiff;
			}else{
				var d = new Date();
				var n = d.getTime(); 
				if(n){
					theElem.setAttribute('dpStart',parseInt(n/1000));
				}else{
					theElem.setAttribute('dpStart',0);
				}
				theSeconds = '&N=0';
			}		
		}
	}
	httpObj.theCount = countNum;

	theURL = AddInterfaceLevelToURL(aProcessURL);
	theURL = theURL + theSeconds + theCount
	
	httpObj.ontimeout = doProcessTimeout;
  httpObj.onload = doProcessSuccess;
  httpObj.onerror = doProcessError;
	httpObj.theURL = theURL;
	httpObj.theTimeout = thetimeout;
	
  //httpObj.open("GET", theURL, true);
	//httpObj.timeout = thetimeout;
  //httpObj.send(null);	
	if(isFirstTime){
		if(firstLoad > 0){
			DebugLog('doProcessAux - isFirstTime, firstload['+firstLoad+']');
			//ExecuteProcessGet(httpObj,theURL,thetimeout);
			//setTimeout('ExecuteProcessGet(httpObj,"'+theURL+'",'+thetimeout+')',firstLoad);
			setTimeout(ExecuteProcessGet,firstLoad,httpObj,theURL,thetimeout);
		}else{
			DebugLog('doProcessAux - isFirstTime, no firstload time');
			ExecuteProcessGet(httpObj,theURL,thetimeout);			
		}
	}else{
		if(refresh > 0){
			DebugLog('doProcessAux - next time['+countNum+'], refresh['+refresh+']');
			//setTimeout(ExecuteProcessGet,refresh,httpObj,theURL,thetimeout);
			ExecuteProcessGet(httpObj,theURL,thetimeout);			

		}else{
			DebugLog('doProcessAux - next time['+countNum+'], no refresh time');
			ExecuteProcessGet(httpObj,theURL,thetimeout);			
		}
		
	}
	
}

function ExecuteProcessGet(aHttpObj,theURL,theTimeout){
	DebugLog('ExecuteProcessGet - url['+theURL+']');
	aHttpObj.open("GET", theURL, true);
	aHttpObj.timeout = theTimeout;
  aHttpObj.send(null);	
}

function doProcessSuccess(){
	if (this.readyState === 4) { 
		if (this.status === 200) {
			//DebugLog('doProcess: doProcessSuccess - OK - text['+this.responseText+'], statusText['+this.statusText+'], ready['+this.readyState+'], status['+this.status+']');
			DebugLog('doProcess: doProcessSuccess - OK - statusText['+this.statusText+'], ready['+this.readyState+'], status['+this.status+']');
			if(this.elmID){
				this.callback(this.elmID,this.responseText,'',this.aStartTime,this.aCount);
			}else{
				this.callback(this.responseText,'');
			}

			if(this.refresh > 0){
				DebugLog('doProcessSuccess - count['+this.theCount+'], refresh['+this.refresh+'], starturl['+this.startURL+'], theTimeout['+this.theTimeout+']');
				//setTimeout(ExecuteProcessGet,this.refresh,this,this.theURL,this.theTimeout);
				setTimeout(doProcessAux,this.refresh,this.elmID,this.startURL,this.callback,this.theTimeout,this.firstLoad,this.refresh);
			}
			
		} else {
			DebugLog('doProcess: doProcessSuccess - ERROR - ready['+this.readyState+'], status['+this.status+']');
			this.onerror();
		}
	}
}

function doProcessError(){
	DebugLog('doProcess: doProcessError - START');
	if(this.elmID){
		this.callback(this.elmID,this.responseText,'Error: '+this.statusText,this.aStartTime,this.aCount);
	}else{
		this.callback(this.responseText,'Error: '+this.statusText);
	}
}

function doProcessTimeout(){
	DebugLog('doProcess: doProcessTimeout - START');
	if(this.elmID){
		this.callback(this.elmID,this.responseText,'Timeout: '+this.statusText,this.aStartTime,this.aCount);
	}else{
		this.callback(this.responseText,'Timeout: '+this.statusText);
	}
}


function doModuleClick(event){
	DebugLog('doModuleClick - START');
	var abutton = getEventTarget(event);
	if(abutton) DebugLog('doModuleClick - button ID['+abutton.id+']');
	
}

//----------------------------------------------------------------------------
function defaultdoProcessCallback(retID,retContent,retMessage){

	DebugLog('defaultdoProcessCallback - id['+retID+'], message['+retMessage+'], len content['+retContent.length+']');
	if(retContent.length < 100){
		DebugLog('defaultdoProcessCallback - content['+retContent+']');
	}
}


//----------------------------------------------------------------------------
function doProcessTableGet(tableControlID,tableRecordID){

	DebugLog('doProcessTableGet - tableControlID['+tableControlID+'], tableRecordID['+tableRecordID+']');
	var theTable = document.getElementById(tableControlID);
	if(theTable){
		DebugLog('doProcessTableGet - found table on page');
		var lastRow = document.getElementById(tableControlID+'dptLR');
		if(lastRow){
			lastRow.tableRecordID = tableRecordID; //STORE FOR LATER USE
			DebugLog('doProcessTableGet - found last row in table');
			var theTimeoutms = lastRow.getAttribute('data-toms');
			DebugLog('doProcessTableGet - timeout attribute says['+ theTimeoutms +']');
			//if(lastRow.firstChild.tempTableText){
			//	DebugLog('doProcessTableGet - we have saved the loading text, so use it');
			//	tmpText = lastRow.firstChild.tempTableText //PULL THIS OUT IF WE HAVE IT
			//	lastRow.firstChild.innerHTML = tmpText;
			//}			
			
			DebugLog('doProcessTableGet - calling doProcessTableCallback');
			var tableAction = 'process/doProcess-Table.asp?TBID='+tableRecordID;
			DebugLog('doProcessTableGet - about to process table action['+ tableAction +']');
			doProcessDiv(tableControlID,tableAction,doProcessTableCallback,theTimeoutms);
			

		}
	}
}


//----------------------------------------------------------------------------
function doProcessTableCancel(tableControlID){
	DebugLog('doProcessTableCancel - tableControlID['+tableControlID+']');
	var theTable = document.getElementById(tableControlID);
	if(theTable){
		var lastRow = document.getElementById(tableControlID+'dptLR');
		if(lastRow){
			DebugLog('doProcessTableCancel - found last row in table, set cancel flag');
			lastRow.tableProcessDoCancel = true;
		}
	}
}


//----------------------------------------------------------------------------
function doProcessTableCallback(retID,retContent,retMessage){

	DebugLog('doProcessTableCallback - id['+retID+'], message['+retMessage+'], len content['+retContent.length+']');
	//if(retContent.length < 100){
		DebugLog('doProcessTableCallback - content['+retContent+']');
	//}
	
	var theTable = document.getElementById(retID);
	if(theTable){
		DebugLog('doProcessTableCallback - found table on page');
		var lastRow = document.getElementById(retID+'dptLR');
		if(lastRow){
			DebugLog('doProcessTableCallback - found last row in table, add rows');
			if(retMessage.includes('Error')){
				lastRow.firstChild.innerHTML = '<span style="color:#900">Problem loading rows: <b>'+retMessage+'</b></span><br>'+ retContent;
			}else{
				// RETMSG FORMAT INCLUDES SOME INFO, PARSE WITH getParsedData AND getParsedItem
				//[OK:rows[~]###[~]total[~]####[~]done[~]1]<tr>....</tr>
				if(retContent.substr(0,4).includes('[OK:')){
					DebugLog('doProcessTableCallback - we have prefixed data');
					var dataStr;
					if(retContent.search(']<') > 0){
						dataStr = retContent.substring(0,retContent.search(']<'));
					}else{
						dataStr = retContent.substring(0,retContent.lastIndexOf(']'));
					}
					DebugLog('doProcessTableCallback - raw data string [ '+dataStr+ ' ]');
					var dataStrLen = dataStr.length;
					dataStr = dataStr.substring(4,dataStrLen);
					DebugLog('doProcessTableCallback - fixed data string [ '+dataStr+ ' ]');
					var rowsStr = retContent.substring(dataStrLen+1,retContent.length);
					DebugLog('doProcessTableCallback - rows string [ '+rowsStr+ ' ]');
					var dataArr = getParsedData(dataStr);
					var rowsAdded = getParsedItem('rows',dataArr);
					DebugLog('doProcessTableCallback - rows added ['+rowsAdded+']');
					var totalRows = getParsedItem('total',dataArr);
					DebugLog('doProcessTableCallback - total rows ['+totalRows+']');
					var doneFlag = getParsedItem('done',dataArr);
					DebugLog('doProcessTableCallback - done flag ['+doneFlag+']');
					
					if(rowsStr.length > 0){
						var rowsCount = countRowsInRowsStr(rowsStr);
						DebugLog('doProcessTableCallback - direct rowsCount ['+rowsCount+'], reported count['+rowsAdded+']');
						var i = 0
						var newRow;
						var rowContent;
						while(i < rowsCount){
							i++;
							newRow = lastRow.cloneNode(true);
							if(newRow){
								lastRow.parentNode.insertBefore(newRow,lastRow);
								DebugLog('doProcessTableCallback - added new row ['+ i +']');
								rowContent = getRowFromRowsStr(rowsStr,i-1);
								newRow.outerHTML = rowContent; //PUT THE ROW CONTENT INTO OUR NEW ROW
								//newRow.id = lastRow.id + 'newone'+ i;
							}
							
						}
						// we might need to re-adjust the header row
						DebugLog('doProcessTableCallback - calling SyncTableHeader for table['+ retID +']');
						SyncTableHeader(retID);
						
					}else{
						DebugLog('doProcessTableCallback - no rows returned - doneFlag['+ doneFlag +']');
					}
					DebugLog('doProcessTableCallback - SUMMARY - rows['+rowsAdded+'], total['+totalRows+'], done['+doneFlag+']');
					if(doneFlag == 1){
						DebugLog('doProcessTableCallback - we are done loading now');
						lastRow.firstChild.innerHTML = '<span style=""vertical-align:top;color:#999;"">Finished - total records: '+totalRows+'</span>';
					}else{
						DebugLog('doProcessTableCallback - need to load more records');
						var tmpText;
						if(lastRow.firstChild.tempTableText){
							DebugLog('doProcessTableCallback - we have saved the loading text, so use it');
							tmpText = lastRow.firstChild.tempTableText //PULL THIS OUT IF WE HAVE IT
						}else{
							DebugLog('doProcessTableCallback - let\'s save the loading text');
							tmpText = lastRow.firstChild.innerHTML; 
							lastRow.firstChild.tempTableText = tmpText;	//STORE THIS FOR USE LATER						
						}
						DebugLog('doProcessTableCallback - control['+ retID +'], record['+ lastRow.tableRecordID +']');
						
						if(doneFlag == 1){
							DebugLog('doProcessTableCallback - since we are done, dont show button or reload auto');
							var newText = 'Total: '+totalRows
							lastRow.firstChild.innerHTML = newText;
							
						}else{
							
							var doAutoLoad = lastRow.getAttribute('data-doal');
							DebugLog('doProcessTableCallback - doAutoLoad['+doAutoLoad+']');
							if(doAutoLoad == '1'){
								var autoLoadms = lastRow.getAttribute('data-alms');
								DebugLog('doProcessTableCallback - doAutoLoad ms['+autoLoadms+']');
								if(lastRow.tableProcessDoCancel){
									var newText = 'Finished: '+totalRows+' &nbsp;&nbsp;';
									// did a cancel action
									newText = newText + ' &nbsp;&nbsp;<span style=""color:#ccc;font-style:italic"">(cancelled)</span>'
									lastRow.firstChild.innerHTML = newText;							
									
								}else{
									var newText = 'Loaded: '+totalRows+' &nbsp;&nbsp;';
									// add a cancel button
									newText = newText + ' <button  style="margin:2px 10px 2px 10px;font-size:9px;" type="button" onclick="javascript:doProcessTableCancel(\''+ retID +'\');return true;">cancel</button>'
									newText = newText + ' &nbsp;&nbsp;loading'
									tmpText = tmpText.replace('loading',newText);
									lastRow.firstChild.innerHTML = tmpText;							
									setTimeout('doProcessTableGet("'+ retID +'",'+ lastRow.tableRecordID +')',autoLoadms);
								}
								
							}else{
								
								DebugLog('doProcessTableCallback - doing manual load button');
								var newText = 'Loaded: '+totalRows+' <button  style="margin:2px 10px 2px 10px;font-size:9px;" type="button" onclick="javascript:doProcessTableGet(\''+ retID +'\','+ lastRow.tableRecordID +');return true;">Get More</button>';
								//tmpText = tmpText.replace('loading',newText);
								lastRow.firstChild.innerHTML = newText;
							}
						}
					}
				}else{
					DebugLog('doProcessTableCallback - some other response from the system:['+ retContent.slice(0,150) +']');
					DebugLog('doProcessTableCallback - some other response from the system');
					if(retContent.indexOf('[Timeout:') >= 0){
						DebugLog('doProcessTableCallback - response: TIMED OUT');
						lastRow.firstChild.innerHTML = '<span style="color:red">Search timed out.</span>';
					}else if(retContent.indexOf('[interface process authentication error') >= 0){
						DebugLog('doProcessTableCallback - response: AUTHENTICATION FAILURE');
						lastRow.firstChild.innerHTML = '<span style="color:red">No longer logged in or session timed out.</span>';
					}else{
						DebugLog('doProcessTableCallback - response: UNHANDLED MESSAGE/CONTENT');
						lastRow.firstChild.innerHTML = '<span style="color:red">Unknown processing response of ['+retMessage+'], content['+ retContent.slice(0,50) +'].</span>';
						//lastRow.firstChild.innerHTML = '<span style="color:red">Unknown processing response of ['+ retMessage +']</span>';
					}
				}
				
			}
			
			DebugLog('doProcessTableCallback - about to call doProcessTableDataCallback - controlID['+ retID +'], recID['+ lastRow.tableRecordID +']');
			var tableDataAction = 'process/doProcess-TableData.asp?TBID='+lastRow.tableRecordID;
			var theDataTimeoutms = 20000;
			doProcessDiv(retID,tableDataAction,doProcessTableDataCallback,theDataTimeoutms);		

		}
		
	}	
	
}



//----------------------------------------------------------------------------
function doProcessTableDataCallback(retID,retContent,retMessage){

	DebugLog('doProcessTableDataCallback - id['+retID+'], message['+retMessage+'], len content['+retContent.length+']');
	//if(retContent.length < 100){
		DebugLog('doProcessTableDataCallback - content['+retContent+']');
	//}
	
	var theTable = document.getElementById(retID);
	if(theTable){
		DebugLog('doProcessTableDataCallback - found table on page');
		var uDataDiv = document.getElementById(retID+'dptUD');
		if(uDataDiv){ 
			DebugLog('doProcessTableDataCallback - found userdata render target div, add rendered block...');
			if(retMessage.includes('Error')){
				uDataDiv.firstChild.innerHTML = '<span style="color:#900">Problem user data rendered block: <b>'+retMessage+'</b></span><br>'+ retContent;
			}else{
				// RETMSG FORMAT INCLUDES SOME INFO, PARSE WITH getParsedData AND getParsedItem
				//[OK:rows[~]###[~]total[~]####[~]done[~]1]SOMEHTMLOUTPUT TO THROW IN THE TARGET DIV
				if(retContent.substr(0,4).includes('[OK:')){
					DebugLog('doProcessTableDataCallback - we have prefixed data');
					var dataStr;
					if(retContent.search(']<') > 0){
						dataStr = retContent.substring(0,retContent.search(']<'));
					}else{
						dataStr = retContent.substring(0,retContent.lastIndexOf(']'));
					}
					DebugLog('doProcessTableDataCallback - raw data string [ '+dataStr+ ' ]');
					var dataStrLen = dataStr.length;
					dataStr = dataStr.substring(4,dataStrLen);
					DebugLog('doProcessTableDataCallback - fixed data string [ '+dataStr+ ' ]');
					var renderStr = retContent.substring(dataStrLen+1,retContent.length);
					DebugLog('doProcessTableDataCallback - render block string [ '+renderStr+ ' ]');
					var dataArr = getParsedData(dataStr);
					var rowsAdded = getParsedItem('rows',dataArr);
					DebugLog('doProcessTableDataCallback - rows added ['+rowsAdded+']');
					var totalRows = getParsedItem('total',dataArr);
					DebugLog('doProcessTableDataCallback - total rows ['+totalRows+']');
					var doneFlag = getParsedItem('done',dataArr);
					DebugLog('doProcessTableDataCallback - done flag ['+doneFlag+']');
					
					if(renderStr.length > 0){
						DebugLog('doProcessTableDataCallback - have render block');
						uDataDiv.innerHTML = renderStr; 

					}else{
						DebugLog('doProcessTableDataCallback - no render block returned - doneFlag['+ doneFlag +']');
					}
					
					DebugLog('doProcessTableDataCallback - SUMMARY - rows['+rowsAdded+'], total['+totalRows+'], done['+doneFlag+']');
					if(doneFlag == 1){
						DebugLog('doProcessTableDataCallback - we are done loading now');
						//uDataDiv.innerHTML = '<span style=""vertical-align:top;color:#999;"">Finished - total records: '+totalRows+'</span>';
					}else{
						DebugLog('doProcessTableDataCallback - need to load more records');

						if(doneFlag == 1){
							DebugLog('doProcessTableDataCallback - since we are done, dont show button or reload auto');
							var newText = 'Total: '+totalRows
							//uDataDiv.firstChild.innerHTML = newText;
							
						}else{
							// MIGHT NOT NEED THIS SECTION
							DebugLog('doProcessTableDataCallback - might not need this section now');
							//var doAutoLoad = lastRow.getAttribute('data-doal');
							//DebugLog('doProcessTableDataCallback - doAutoLoad['+doAutoLoad+']');
						}
					}
					
				}else{
					DebugLog('doProcessTableDataCallback - some other response from the system');
					if(retContent.indexOf('[Timeout:') >= 0){
						DebugLog('doProcessTableDataCallback - request for render timed out');
						//uDataDiv.firstChild.innerHTML = '<span style="color:red">Search timed out.</span>';
					}else{
						DebugLog('doProcessTableDataCallback - request for render - other response ['+ retMessage +']');
						//uDataDiv.firstChild.innerHTML = '<span style="color:red">Unknown search response of ['+retMessage+'].</span>';
					}
				}
				
			}
		}
	}	
	
}




function countRowsInRowsStr(aStr){
	var trs = aStr.indexOf('<tr',0);
	var tre = aStr.indexOf('</tr>',0);
	var trc = 0;
	var trn = -1;
	if((trs > -1) && (tre > -1)){
		while(trs > -1){
			trn = aStr.indexOf('<tr',trs+1); //LOOK FOR NEXT ONE
			if((trn > -1) && (trn < tre)){ // LOOKS LIKE A ROW INSIDE A ROW
				DebugLog('countRowsInRowsStr - might have a row inside a row here');
			}else{
				trc++;
				trs = aStr.indexOf('<tr',tre+1);
				tre = aStr.indexOf('</tr>',tre+1);
			}
		}
	}
	return trc;
}

function getRowFromRowsStr(aStr,aIndex){
	var trs = aStr.indexOf('<tr',0);
	var tre = aStr.indexOf('</tr>',0);
	var trc = 0;
	var trn = -1;
	var rowContent = '';
	DebugLog('getRowFromRowsStr - get row at index ['+aIndex+']');
	if((trs > -1) && (tre > -1)){
		while(trs > -1){
			trn = aStr.indexOf('<tr',trs+1); //LOOK FOR NEXT ONE
			if((trn > -1) && (trn < tre)){ // LOOKS LIKE A ROW INSIDE A ROW
				DebugLog('getRowFromRowsStr - might have a row inside a row here');
			}else{
				if(trc == aIndex){
					rowContent = aStr.substring(trs,tre+5);
					DebugLog('getRowFromRowsStr - raw row content['+rowContent+']');

						//trn = rowContent.indexOf('>',0);
						//tre = rowContent.length;
						//DebugLog('getRowFromRowsStr - trn['+trn+'], tre['+tre+']');
						//rowContent = rowContent.substring(trn+1,tre);
						//DebugLog('getRowFromRowsStr - fixed row content['+rowContent+']');
				}
				trc++;
				trs = aStr.indexOf('<tr',tre+1);
				tre = aStr.indexOf('</tr>',tre+1);
			}
		}
	}
	return rowContent;
}



function getParsedData(aDataStr){
//the datastr has the format itemkey[~]itemvalue[~]itemkey[~]itemvalue
var items = aDataStr.split('[~]');
return items
}

function getParsedItem(itemName,itemsArray){
var itemvalue = '';
var itemkey = '';
	if(itemsArray){
		for(var i = 0; (i < itemsArray.length) && (itemvalue == ''); i = i + 2){
			itemkey = itemsArray[i];
			if(itemName.match(itemkey)){
				itemvalue = itemsArray[i+1];
			}
		}
	}
return itemvalue;	
}

var gcsuN = '';
var gcscID = 0;
var gcspID = 0;
var gcsuID = 0;
var gcsiL = 0;

function CheckSession(aID,uName,cID,pID,uID,iL){
	DebugLog('CheckSession - START - id['+ aID +'], level['+ iL +']');
	gcsuN = uName;
	gcscID = cID;
	gcspID = pID;
	gcsuID = uID;
	gcsuiL = iL;
	gProcessInterfaceLevel = iL; 
	gProcessSessCheck = aID;
	setTimeout('CheckSessionAux("'+aID+'")',180000);//3MIN REFRESH
}

function CheckSessionAux(aID){
	DebugLog('CheckSessionAux - id['+aID+']');
	var checkURL = 'process/doProcess-ChkSess.asp?SI='+aID;
	doProcess(checkURL,CheckSessionResult,30000);
	setTimeout('CheckSessionAux("'+aID+'")',180000); //3MIN REFRESH
}

function CheckSessionResult(theText,errorStr){
	DebugLog('CheckSessionResult - START - text['+theText+'], errStr['+errorStr+']');
	
	if (theText.indexOf('authentication error') >= 0){
		
		var logoutURL = 'dologout.asp?User='+gcsuN+'&ClientID='+gcscID+'&PartnerID='+gcspID+'&UserID='+gcsuID+'&iLvl='+gcsuiL+'&src=indexCheckSession&exp=true';
		//DebugLog('CheckSessionResult - need to logout using URL['+logoutURL+']');
		window.location.href = logoutURL;
		
	}else{
		DebugLog('CheckSessionResult - still good');
	}
	
}


function GetPathRelToSys(){
var thebase = '';
var theURL = window.location.href;
	DebugLog('GetPathRelToSys - cur URL['+theURL+']');
	var i = theURL.indexOf('/sys/');
	if(i >= 0){
		DebugLog('GetPathRelToSys - sys is in path');
		var cutURL = theURL.substring(i+5,theURL.length);
		DebugLog('GetPathRelToSys - cut URL is ['+cutURL+']');
		var moreDirs = countInStr(cutURL,'/');
		DebugLog('GetPathRelToSys - count slashes ['+ moreDirs +']');
		if(moreDirs >= 1){
			for(var j=0;j<moreDirs;j++){
				thebase += '../';
			}
		}else{
			
		}
	}else{
		DebugLog('GetPathRelToSys - sys NOT in path');
	}
	DebugLog('GetPathRelToSys - return base['+thebase+']');
return thebase;	
}


function countInStr(aString,aSubStr) {
var retCount = 0;
	if(aString){
   var tmpStr = aString.split(aSubStr);
	 if(tmpStr){
		retCount = tmpStr.length - 1;	
	 }
	}
return retCount;
}



function DoFavClick(aDivClassID,aFavType,aFavItemID,aUserID,aClientID){
	//var fav = document.getElementById(aDiv);	
	DebugLog('DoFavClick - class id['+aDivClassID+']');
	var divArr = document.getElementsByClassName(aDivClassID);
	var actionID = '';
	if(divArr){
		var actionURL = '';
		for(var i = 0; i < divArr.length; i++) {
			fav = divArr[i];
			if(fav){
				ToggleClassForElement(fav,'TPfstar','TPfselstar');
				if(HasClassName(fav,'TPfselstar')){
					RemoveClassForElement(fav,'TPfavhide');
					actionID = '1';
				}else{
					AddClassForElement(fav,'TPfavhide');
					actionID = '0'
				}
				actionURL = 'rel:'+ GetPathRelToSys() + 'process/doProcess-FavAction.asp?C='+aClientID+'&UID='+aUserID+'&FT='+aFavType+'&FI='+aFavItemID+'&FA='+actionID;
				ProcessAction(actionURL,'','');
			}
		}
	}
}

function DoCBClick(aDivClassID,aFavType,aFavItemID,aUserID,aClientID){
	//var fav = document.getElementById(aDiv);	
	DebugLog('DoFavClick - class id['+aDivClassID+']');
	var divArr = document.getElementsByClassName(aDivClassID);
	var actionID = '';
	if(divArr){
		var actionURL = '';
		for(var i = 0; i < divArr.length; i++) {
			fav = divArr[i];
			if(fav){
				ToggleClassForElement(fav,'TPcb','TPselcb');
				if(HasClassName(fav,'TPselcb')){
					RemoveClassForElement(fav,'TPfavhide');
					actionID = '1';
				}else{
					AddClassForElement(fav,'TPfavhide');
					actionID = '0'
				}
				actionURL = 'rel:'+ GetPathRelToSys() + 'process/doProcess-FavAction.asp?C='+aClientID+'&UID='+aUserID+'&FT='+aFavType+'&FI='+aFavItemID+'&FA='+actionID;
				ProcessAction(actionURL,'','');
			}
		}
	}
}

//checkbox click
function DoDEcbClick(aDivClassID,aCBtable,aCBfield,aCBrecID,aCBaction,aUserID,aClientID){
	//var fav = document.getElementById(aDiv);	
	DebugLog('DoDEcbClick - class id['+aDivClassID+']');
	var divArr = document.getElementsByClassName(aDivClassID);
	var actionID = '';
	if(divArr){
		var actionURL = '';
		for(var i = 0; i < divArr.length; i++) {
			fav = divArr[i];
			if(fav){
				ToggleClassForElement(fav,'TPcb','TPselcb');
				if(HasClassName(fav,'TPselcb')){
					RemoveClassForElement(fav,'TPcbhide');
					actionID = '1';
				}else{
					AddClassForElement(fav,'TPcbhide');
					actionID = '0'
				}
				actionURL = 'rel:'+ GetPathRelToSys() + 'process/doProcess-CBAction.asp?C='+aClientID+'&UID='+aUserID+'&CBT='+aCBtable+'&CBF='+aCBfield+'&CBR='+aCBrecID+'&CBA='+aCBaction
				ProcessAction(actionURL,'','');
			}
		}
	}
}


function DoDEtextClick(theElement,aTextClass,aEditClass,aUniquePrefix){
	var actionID = 0;
	DebugLog('DoDEtextClick - text['+aTextClass+'], edit['+aEditClass+']');
	if(theElement){
		//ToggleClassForElement(theElement,'TPfstar','TPfselstar');
		if(HasClassName(theElement,'TPdeHide')){
			RemoveClassForElement(theElement,'TPdeHide');
			actionID = 1;
		}else{
			AddClassForElement(theElement,'TPdeHide');
			actionID = 0;
		}		
		DebugLog('DoDEtextClick - action id['+actionID+']');
		var edItemID = aUniquePrefix + aEditClass;
		var edInputID = 'in'+aUniquePrefix + aEditClass;
		
		var edElm = document.getElementById(edItemID);
		if(edElm){
			DebugLog('DoDEtextClick - have edit element id ['+edItemID+']');
			if(actionID == 0){
				RemoveClassForElement(edElm,'TPdeHide');
				DebugLog('DoDEtextClick - removed hide');
				var xdiv = document.getElementById('xid');
				xdiv.tabIndex = -1;
				var chkdiv = document.getElementById('chkid');
				chkdiv.tabIndex = -1;
				var inputdiv = document.getElementById(edInputID);
				inputdiv.focus();
				DebugLog('DoDEtextClick - set focus and set controls');
			}else{
				AddClassForElement(edElm,'TPdeHide');
				DebugLog('DoDEtextClick - added hide');
			}
		}

	}
}

function DoDEcancel(aTextClass,aEditClass,aUniquePrefix){
	setTimeout('DoDEcancelEx("'+aTextClass+'","'+aEditClass+'","'+aUniquePrefix+'")',100);
}

function DoDECheckClick(aTextClass,aEditClass,aUniquePrefix){
	g_AvoidCancel = true;
	DebugLog('DoDECheckClick - button clicked');
}

var g_AvoidCancel = false;

function DoDEcancelEx(aTextClass,aEditClass,aUniquePrefix){
	var actionID = 0;
	DebugLog('DoDEcancel - text['+aTextClass+'], edit['+aEditClass+']');
	if(g_AvoidCancel){
		DebugLog('DoDEcancel - avoiding cancel action');
		g_AvoidCancel = false;
	}else{
		DebugLog('DoDEcancel - DO cancel action');
		var textItemID = aUniquePrefix + aTextClass;
		var theElement = document.getElementById(textItemID);
		if(theElement){
			DebugLog('DoDEcancel - remove hide from text version - cur class['+theElement.className+']');			
			if(HasClassName(theElement,'TPdeHide')){
				RemoveClassForElement(theElement,'TPdeHide');
				actionID = 1;
			}		
			var edItemID = aUniquePrefix + aEditClass;
			var edElm = document.getElementById(edItemID);
			if(edElm){
				DebugLog('DoDEcancel - have edit element id ['+edItemID+']');
				if(actionID == 1){
					AddClassForElement(edElm,'TPdeHide');
					DebugLog('DoDEtextClick - added hide');
				}
			}

		}
	}
}

function DoDEeditClick(theElement,aDivClassID,aTable,aRecID,aField,aType,aUserID,aClientID){
	//var fav = document.getElementById(aDiv);	
	DebugLog('DoDEClick - class id['+aDivClassID+']');
	var divArr = document.getElementsByClassName(aDivClassID);
	var actionID = '';
	if(divArr){
		var actionURL = '';
		for(var i = 0; i < divArr.length; i++) {
			edititem = divArr[i];
			if(edititem){
				ToggleClassForElement(edititem,'TPfstar','TPfselstar');
				if(HasClassName(edititem,'TPfselstar')){
					RemoveClassForElement(edititem,'TPfavhide');
					actionID = '1';
				}else{
					AddClassForElement(edititem,'TPfavhide');
					actionID = '0'
				}
				actionURL = 'rel:'+ GetPathRelToSys() + 'process/doProcess-EditAction.asp?C='+aClientID+'&UID='+aUserID+'&ET='+aTable+'&EI='+aRecID+'&EF='+aField+'&EY='+aType;
				ProcessAction(actionURL,'','');
			}
		}
	}
}



//--- clear out the console ---
if (window.console && console.log) {
  var adt = new Date();
  console.clear; 
  console.log('START LOG ['+ adt.toString() +']');
}
//-----------------------------


//----------------------------------------------------------------------------
function DoJSDebugInfo(){
  DebugLog('START - JS Debug Information Dump');
  DebugLog('JS Debug State value ['+ g_JSDebugState + ']');
  DebugLog('Current ViewPort Width: '+ ViewPortWidth());
  DebugLog('Current ViewPort Height: '+ ViewPortHeight());
  AddToDebugDiv('(JS output) Current Viewport Width: '+ViewPortWidth());
  AddToDebugDiv('(JS output) Current Viewport Height: '+ViewPortHeight());
	AddToDebugDiv('(JS output) Device Pixel Ratio: '+window.devicePixelRatio);
	if(typeof window.innerWidth != 'undefined'){
		AddToDebugDiv('(JS output) Window Width: '+window.innerWidth);
		AddToDebugDiv('(JS output) Window Height: '+window.innerHeight);
	}
	if(typeof screen.width != 'undefined'){
		AddToDebugDiv('(JS output) Screen Width: '+screen.width);
		AddToDebugDiv('(JS output) Screen Height: '+screen.height);
	}
	AddToDebugDiv('- - -');

  DebugLog('END - JS Debug Information Dump');

}



//----------------------------------------------------------------------------
function AddToDebugDiv(aMsg){
var dd = document.getElementById("JSDebugDiv");
  if (dd) {
    dd.innerHTML = dd.innerHTML + aMsg + '<br>';
  }
} 


var g_DLstarted = 0;
var g_DLstartTime = 0;

//----------------------------------------------------------------------------
function DebugLog(aMsg){
	if(!g_DLstarted){g_DLstartTime = window.performance.now();g_DLstarted=1;}
  if (window.console && console.log) {
		var endTime = window.performance.now();
		var diffTime = myTrunc(endTime - g_DLstartTime);
		var newMsg = '['+ diffTime +'] '+ aMsg
		console.log(newMsg); 
	}
} 

function myTrunc(aNum,decimalPlaces){
  var numStr = aNum.toString();
  var places = decimalPlaces ? decimalPlaces : 0;
  var apos = numStr.indexOf('.') != -1 ? numStr.indexOf('.') + places + 1 : numStr.length;
  return parseFloat(aNum.toString().substring(0, apos));
};


var g_JSDebugState = 0;
var g_SysPage = 'index.asp';

//----------------------------------------------------------------------------
function InDebugState(){
var aval = false;

  if (g_JSDebugState == 1) {
    aval = true
  }
  return aval;
} 

// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.

//EXAMPLE:
//  var myEfficientFn = debounce(function() {
//	  // All the taxing stuff you do
//  }, 250);
//  window.addEventListener('resize', myEfficientFn);


function hoverBox(element,aWidth,aHTMLText){
var theText = decodeURIparam(aHTMLText);
	DebugLog('hoverBox - START - width['+aWidth+'], text['+theText+']');
	var theBox = document.getElementById('tpHoverBox');
	if(!theBox){
		DebugLog('hoverBox - building tpHoverBox');
		var theAdd = '<style type="text/css">#tpHoverBox{font-size:9pt;padding:10px;opacity:0.1; transition:opacity 0.5s} #tpHoverBox:hover{opacity:1.0;}</style>';
		theAdd += '<div id="tpHoverBox" style="display:block;position:absolute;visibility:hidden;width:'+aWidth+';height:auto;z-index:1000;background-color:#fff;border:1px solid #000;border-radius:20px;">&nbsp;</div>'
		document.body.innerHTML += theAdd
		theBox = document.getElementById('tpHoverBox');
	}
	if(theBox){
		DebugLog('hoverBox - now have tpHoverBox');
		theBox.innerHTML = theText;
		var curTop = parseInt(this.style.top);
		var curLeft = parseInt(this.style.top);
		theBox.style.top = curTop+'px';
		theBox.style.left = curLeft+'px';
		ShowDiv('tpHoverBox');
		DebugLog('hoverBox - now shown at top['+theBox.style.top+'], left['+theBox.style.left+']');
	}else{
		DebugLog('hoverBox - ERROR: could  not create and find tpHoverBox element');
	}
}

//----------------------------------------------------------------------------
function debounce(func, wait, immediate) {
	var timeout;
	return function() {
		var context = this, args = arguments;
		var later = function() {
			timeout = null;
			if (!immediate) func.apply(context, args);
		};
		var callNow = immediate && !timeout;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) func.apply(context, args);
	};
};


//----------------------------------------------------------------------------
function AdjustInputTextForDomain(anID,aAttribute,aPlaceholder,aDefaultText,aDomain,aNewText){
var theEle = document.getElementById(anID);	
	
	//DebugLog('AdjustTextForDomain - start');
	if(theEle){
		if(aAttribute == 'innerHTML'){
			DebugLog('AdjustTextForDomain - have element ['+anID+'], updating innerHTML');
			var theHTML = theEle.innerHTML;
			if(theHTML){
				//DebugLog('AdjustTextForDomain - have attribute ['+theAttr+']');
				//DebugLog('AdjustTextForDomain - cur url is ['+window.location.href+']');
				if(window.location.href.indexOf(aDomain) > -1){
					//DebugLog('AdjustTextForDomain - found a match for the domain check ['+aDomain+']');
					theHTML = theHTML.replace(aPlaceholder,aNewText);
					//DebugLog('AdjustTextForDomain - updated to new attribute ['+theAttr+']');
					theEle.innerHTML = theHTML;			
				}else{
					//DebugLog('AdjustTextForDomain - domain match failed for ['+aDomain+'], using defaults');
					theHTML = theHTML.replace(aPlaceholder,aDefaultText);
					//DebugLog('AdjustTextForDomain - updated to default attribute ['+theAttr+']');
					theEle.innerHTML = theHTML;	
				}
			}			
		}else{
			DebugLog('AdjustTextForDomain - have element ['+anID+'], updating attribute['+aAttribute+']');
			var theAttr = theEle.getAttribute(aAttribute);
			if(theAttr){
				//DebugLog('AdjustTextForDomain - have attribute ['+theAttr+']');
				//DebugLog('AdjustTextForDomain - cur url is ['+window.location.href+']');
				if(window.location.href.indexOf(aDomain) > -1){
					//DebugLog('AdjustTextForDomain - found a match for the domain check ['+aDomain+']');
					theAttr = theAttr.replace(aPlaceholder,aNewText);
					//DebugLog('AdjustTextForDomain - updated to new attribute ['+theAttr+']');
					theEle.setAttribute(aAttribute,theAttr);				
				}else{
					//DebugLog('AdjustTextForDomain - domain match failed for ['+aDomain+'], using defaults');
					theAttr = theAttr.replace(aPlaceholder,aDefaultText);
					//DebugLog('AdjustTextForDomain - updated to default attribute ['+theAttr+']');
					theEle.setAttribute(aAttribute,theAttr);
				}
			}
		}
	}
}


//----------------------------------------------------------------------------
function PageRescroll(aPosition){
var preVal;
var postVal;
var didIt = false;
  if(aPosition >= 0){
    DebugLog('PageRescroll - to pos['+aPosition+']');
    preVal = document.documentElement.scrollTop;
    DebugLog('PageRescroll - element current['+document.documentElement.scrollTop+']');
    document.documentElement.scrollTop = aPosition;
    postVal = document.documentElement.scrollTop;
    DebugLog('PageRescroll - element after['+document.documentElement.scrollTop+']');
    if((preVal == postVal)&&(postVal = aPosition)){
      didIt = true;
    }
    if(didIt == false)
    {
      DebugLog('PageRescroll - body current['+document.body.scrollTop+']');
      document.body.scrollTop = aPosition;
      DebugLog('PageRescroll - body after['+document.body.scrollTop+']');
    }
  }else{
    DebugLog('PageRescroll - invalid position['+aPosition+']');
  }
}

//----------------------------------------------------------------------------
function PageScrollUp(aPixels){
  if(aPixels){
    DebugLog('PageScrollUp - scroll up by['+aPixels+']');
    var newpos = GetScrollTop(); 
    DebugLog('PageScrollUp - current['+newpos+']');
    newpos = newpos - aPixels;
    DebugLog('PageScrollUp - new['+newpos+']');
    PageRescroll(newpos);
  }
}

//----------------------------------------------------------------------------
function PageScrollDown(aPixels){
  if(aPixels){
    DebugLog('PageScrollDown - scroll down by['+aPixels+']');
    var newpos = GetScrollTop(); 
    DebugLog('PageScrollDown - current['+newpos+']');
    newpos = newpos + aPixels;
    DebugLog('PageScrollDown - new['+newpos+']');
    PageRescroll(newpos);
    DebugLog('PageScrollDown - final pos['+GetScrollTop()+']');
  }
}

//----------------------------------------------------------------------------
function scrollDown(anID){
var theElement = document.getElementById(anID);
  if(theElement){
    DebugLog('scrollDown - scroll down to bottom of ['+anID+'], cur scrolltop['+theElement.scrollTop+'], scrollheight['+theElement.scrollHeight+'], clientHeight['+theElement.clientHeight+']');
		var lastoverflow = theElement.style.overflowY;
		
		var newscrolltop = theElement.scrollHeight - theElement.clientHeight;
		if(newscrolltop < 0){
			newscrolltop = 0;
		}
		DebugLog('scrollDown - newscrolltop ['+newscrolltop+'], lastoverflow['+lastoverflow+']');
    //document.getElementById(anID).scrollTop = newscrolltop;
		//theElement.style.overflowY = 'hidden';
		//theElement.style.overflowY = lastoverflow;
		//document.getElementById(anID).style.overflowY = 'hidden';
		//document.getElementById(anID).style.overflowY = 'scroll';
    //document.getElementById(anID).scrollTop = newscrolltop;
		DebugLog('scrollDown - new scrolltop['+document.getElementById(anID).scrollTop+']');
		document.getElementById('CHL').scrollTop = 91;
		DebugLog('scrollDown - CHL scrolltop['+document.getElementById('CHL').scrollTop+']');
  }
}

//----------------------------------------------------------------------------
function WaitAndScrollDown(anID,aWaitTime){
  DebugLog('WaitAndScrollDown - ['+anID+'], waitTime['+aWaitTime+']');
  setTimeout('scrollDown("'+anID+'")',aWaitTime);
}


//----------------------------------------------------------------------------
function WaitAndScrollToElement(aElement,aWaitTime){
  DebugLog('WaitAndScrollToElement - ['+aElement+'], waitTime['+aWaitTime+']');
  setTimeout('ScrollToElement("'+aElement+'")',aWaitTime);
}

//----------------------------------------------------------------------------
function ScrollToElement(aElement){
var theElement = document.getElementById(aElement);
  
  if(theElement){
    var thePos = getOffset(theElement).top;
    DebugLog('ScrollToElement - ['+aElement+'], offset['+thePos+']');
    PageRescroll(thePos);
  }else{
    DebugLog('ScrollToElement - item not found - element ['+aElement+']');
  }
}

//----------------------------------------------------------------------------
function ScrollToChild(aElement,aChildElement){
var theElement = document.getElementById(aElement);
  DebugLog('ScrollToChild - START - parent['+aElement+'], child['+aChildElement+']');
  if(theElement){
		var theChild = document.getElementById(aChildElement);
		if(theChild){
    var thePos = theChild.offsetTop;
    DebugLog('ScrollToChild - parent['+aElement+'], child['+aChildElement+'] child offset['+thePos+']');
    theElement.scrollTop = thePos;
		}else{
			DebugLog('ScrollToChild - item not found - child element ['+aChildElement+']');
		}
  }else{
    DebugLog('ScrollToChild - item not found - parent element ['+aElement+']');
  }
}


//----------------------------------------------------------------------------
function textareaTrimmer(taName, maxLength){
var ta = document.getElementsByName(taName)[0];

    if (ta.value.length > maxLength)
    {
        ta.value = ta.value.substring(0, maxLength);
    }
}

//----------------------------------------------------------------------------
function playMedia(itemID){
var item = document.getElementByID(itemID);

    if(item)
    {
        item.play();
    }
}


//----------------------------------------------------------------------------
function getDateTime() {
  var now     = new Date(); 
  var year    = now.getFullYear();
  var month   = now.getMonth()+1; 
  var day     = now.getDate();
  var hour    = now.getHours();
  var minute  = now.getMinutes();
  var second  = now.getSeconds(); 
  if(month.toString().length == 1) {
      var month = '0'+month;
  }
  if(day.toString().length == 1) {
      var day = '0'+day;
  }   
  if(hour.toString().length == 1) {
      var hour = '0'+hour;
  }
  if(minute.toString().length == 1) {
      var minute = '0'+minute;
  }
  if(second.toString().length == 1) {
      var second = '0'+second;
  }   
  var dateTime = year+'/'+month+'/'+day+' '+hour+':'+minute+':'+second;   
  return dateTime;
}

//----------------------------------------------------------------------------
function DateDiff(aDT1,aDT2){
  var date1 = new Date(aDT1);
  var date2 = new Date(aDT2); 
  //DebugLog('DateDiff - dt1['+aDT1+'], dt2['+aDT2+']');
  //DebugLog('DateDiff - date1['+date1+'], date2['+date2+']');
  
  if (date2 < date1) {
    date2.setDate(date2.getDate() + 1);
  }
  var diff = date2 - date1;
  return diff;
}



//----------------------------------------------------------------------------
function clickButton(e, buttonid){ 
      var bt = document.getElementById(buttonid); 
      if (typeof bt == 'object'){ 
            if(navigator.appName.indexOf("Netscape")>(-1)){ 
                  if (e.keyCode == 13){ 
                        bt.click(); 
                        return false; 
                  } 
            } 
            if (navigator.appName.indexOf("Microsoft Internet Explorer")>(-1)){ 
                  if (event.keyCode == 13){ 
                        bt.click(); 
                        return false; 
                  } 
            } 
      } 
} 

//----------------------------------------------------------------------------
function GetScrollTop(){
var st;
  st = 0;
	if(window.pageYOffset){
		st = window.pageYOffset;
	}else{
		if(document.body.scrollTop == 0){
			st = document.documentElement.scrollTop;
		}else{
			st = document.body.scrollTop;
		}
	}
return st;
}

//----------------------------------------------------------------------------
function GetScrollLeft(){
var sl;
  sl = 0;
  if(document.body.scrollTop == 0){
    sl = document.documentElement.scrollLeft;
  }else{
    sl = document.body.scrollLeft;
  }

return sl;
}


//----------------------------------------------------------------------------
function doReloadPage()
{
	var thePage = window.location.href;
	DebugLog('doReloadPage - the page URL['+thePage+']');
	//doBP(thePage);
	doWS(thePage);
}

//----------------------------------------------------------------------------
function doReloadPageNoSpin()
{
	var thePage = window.location.href;
	DebugLog('doReloadPageNoSpin - the page URL['+thePage+']');
	//doBP(thePage);
	GoToPage(thePage);
}


//----------------------------------------------------------------------------
function prpAllfrmSBD(){
	DebugLog('start prpAllfrmSBD');
	var frmsList = document.getElementsByTagName('form');
	if(frmsList){for(var i=0;i<frmsList.length;i++){prpfrmSBD(frmsList[i].name);}}
}


//----------------------------------------------------------------------------
function prpfrmSBD(aFormName){
	DebugLog('start prpfrmSBD for FormName['+ aFormName +']');
	if(aFormName != ''){
		document.getElementsByName(aFormName)[0].addEventListener('submit', function(e){
			var frm = e.target;
			if(frm.frmdidSubmit){e.preventDefault();   
			}else{
				//e.preventDefault();
				var btnVal = document.activeElement.getAttribute('value');
				frm.frmdidSubmit = true;
				var btns = frm.querySelectorAll('input[type=submit]'); var bgc; var intxt = ''; var txts = '0.7';
				for(var i = 0;i < btns.length; ++i){
					if(btnVal == btns[i].value){DebugLog('CLICKED ONE');bgc='#cfc';intxt='processing...';txts='0.6em;font-weight:normal;';if(btns[i].clientWidth < 50){intxt='...';txts='1.0em;font-weight:bold';} }else{bgc='#eee';intxt='';txts='0.7em;font-weight:normal;'; }
					var whV = 'display:inline-block;position:relative;vertical-align:top;overflow:hidden;border:1px solid rgba(0,0,0,0.1);border-radius:6px;color:#999;padding:0;text-align:center;background-color:'+ bgc +';width:' + btns[i].clientWidth + 'px;height:' + btns[i].clientHeight + 'px;';
					var clV = '';
					if(btns[i].className != ''){clV = 'class="' + btns[i].className +'" '};
					var theID = 'fsbid' + Math.floor(Math.random()*10000);
					var theDiv = '<div id="'+ theID +'"><div>&nbsp;</div></div>';
					if(intxt == ''){theDiv='&nbsp;';}else{
						var ipbox = document.getElementById('PageWaitDiv');
						if(ipbox){killDynDivLoads();}
					}
					btns[i].insertAdjacentHTML('afterend', '<div '+ clV +'style="'+ whV +'">'+ theDiv +'</div>');
					//btns[i].insertAdjacentHTML('afterend', '<div '+ clV +'style="'+ whV +'"><span style="display:inline-block;position:relative;top:40%;transform:translateY(-50%);margin-left:auto;margin-right:auto;font-size:'+ txts +';">'+ intxt +'</span></div>');
					btns[i].style.display = 'none'; 
					MakeSpinnerInElement(theID,1,4,32,'#4a4',1);	
				}
			}
		});
	}
}



//----------------------------------------------------------------------------
function submitForm(aFormName,msToWait)
{
	DebugLog('submitForm - formName['+ aFormName +'], wait time ['+ msToWait +']');
	if(msToWait > 0){
		DebugLog('submitForm - about to wait ['+msToWait+'ms]');
		setTimeout('submitForm("'+aFormName+'",0)',msToWait);
	}else{
		DebugLog('submitForm - submitting form.');
		document.forms[aFormName].submit();
	}
}


//----------------------------------------------------------------------------
function addHiddenToForm(aFormName,aName,aValue)
{
	DebugLog('addHiddenToForm - formName['+ aFormName +'], name['+ aName +'] value['+ aValue +']');
	var theForm = document.getElementsByName(aFormName)[0];
	if(theForm){
		var theInput = document.createElement("input");
		theInput.setAttribute("type","hidden");
		theInput.setAttribute("name",aName);
		theInput.setAttribute("value",aValue);
		theForm.appendChild(theInput);
		DebugLog('addHiddenToForm - added hidden field to the form');
	}else{
		DebugLog('addHiddenToForm - form not found');
	}
}



//----------------------------------------------------------------------------
function waitAndReloadPageRunFunc(msToWait,additionalJStoRun)
{
	DebugLog('waitAndReloadPageRunFunc - wait time ['+ msToWait +'], codeToRun['+ additionalJStoRun +']');
	var thefunccall = 'doRunCodeStr("'+additionalJStoRun+'");doReloadPage();';
	setTimeout(thefunccall,msToWait);
}

//----------------------------------------------------------------------------
function doRunCodeStr(additionalJStoRun)
{
	DebugLog('doRunCodeStr - codeToRun['+ additionalJStoRun +']');
	if(additionalJStoRun){
		// the js may have encoded single quotes it in that we need to decode
		var newjs = ConvertJSQ(additionalJStoRun);
		DebugLog('doRunCodeStr2 - newjs['+ newjs +']');
		var retval = eval(newjs);
		DebugLog('doRunCodeStr - result['+ retval +']');
	}
}

//----------------------------------------------------------------------------
function ConvertJSQ(aText)
{
	var jsmatchstr = '[jsq]';
	jsmatchstr = jsmatchstr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
	newtext = aText;
	newtext = newtext.replace(new RegExp(jsmatchstr,'gi'),'\'');	
	return newtext;
}

//----------------------------------------------------------------------------
function waitAndReloadPage(msToWait)
{
	setTimeout('doReloadPage()',msToWait);
}

//----------------------------------------------------------------------------
function waitAndReloadPageNoSpin(msToWait)
{
	setTimeout('doReloadPageNoSpin()',msToWait);
}

//----------------------------------------------------------------------------
function doBP(thePage)  // adds the current window position into the URL to reposition the page
{
  var newURL = updateURLParameter(thePage, 'bpos', GetScrollTop()); //updateURLParameter(url, param, paramVal)
  //window.location.href = thePage + '&bpos=' + GetScrollTop();
  window.location.href = newURL;
}

//----------------------------------------------------------------------------
function doWS(thePage)  // activates the wait screen if needed during the load, adds the page body position too
{
	ShowWaitNow();
  var newURL = updateURLParameter(thePage, 'bpos', GetScrollTop()); //updateURLParameter(url, param, paramVal)
  GoToPage(newURL);
}

//----------------------------------------------------------------------------
function goWS(thePage)  // activates the wait screen if needed during the load
{
  ShowWaitNow();
  GoToPage(thePage);
}

//----------------------------------------------------------------------------
function goExt(thePage)  // LOAD A PAGE IN A NEW WINDOW
{
	if(location.hostname === 'localhost'){
		if(thePage.indexOf('//') == -1){
			thePage = '//localhost/weo1.com'+ thePage;
		}
	}
  window.open(thePage,'_blank');
}

//----------------------------------------------------------------------------
function ShowWait() {
var thebox = document.getElementById('PageWaitDiv');
  if (thebox) {
    if ( thebox.style.display == 'none') {
      setTimeout("DoActivateWait()", 500);
    }
  }
}

//----------------------------------------------------------------------------
function ShowWaitNow() {
var thebox = document.getElementById('PageWaitDiv');
  if (thebox) {
    if ( thebox.style.display == 'none') {
      setTimeout('DoActivateWait()',1);
			killDynDivLoads();
    }
  }
}


//----------------------------------------------------------------------------
function DoActivateWait() {
var thebox = document.getElementById('PageWaitDiv');
  if (thebox) {
    if ( thebox.style.display == 'none') {
     thebox.style.display = 'inline';
     SetupSpinner();
     SetWaitSize();
     DoRefreshSize();
    }
  }
}

//----------------------------------------------------------------------------
function DoRefreshSize(){
var thebox = document.getElementById('PageWaitDiv');
  if (thebox) {
    if ( thebox.style.display != 'none') {
      SetWaitSize();
      setTimeout("DoRefreshSize()",100);
    }
  }
}

//----------------------------------------------------------------------------
function GoToPage(theURL) {
  setTimeout('GoToPageAux("'+theURL+'")', 10);
}

//----------------------------------------------------------------------------
function GoToPageAux(theURL) {
	if(location.hostname === 'localhost'){
		if(theURL.indexOf('//') == -1){
			theURL = '//localhost/weo1.com'+ theURL;
		}
	}
  window.location.href = theURL;
}

var g_SpinnerColor = '#555';
var g_SpinnerLineLen = 8;

//----------------------------------------------------------------------------
function SetupSpinner(){
var opts = {
  lines: 24, // The number of lines to draw
  length: g_SpinnerLineLen, // The length of each line
  width: 1, // The line thickness
  radius: 8, // The radius of the inner circle
  corners: 1, // Corner roundness (0..1)
  rotate: 0, // The rotation offset
  color: g_SpinnerColor, // #rgb or #rrggbb
  speed: 0.5, // Rounds per second
  trail: 30, // Afterglow percentage
  shadow: false, // Whether to render a shadow
  hwaccel: false, // Whether to use hardware acceleration
  className: 'spinner', // The CSS class to assign to the spinner
  zIndex: 2e9, // The z-index (defaults to 2000000000)
  top: 'auto', // Top position relative to parent in px
  left: 'auto' // Left position relative to parent in px
  };


  var target = document.getElementById('InSpin');
  var spinner = new Spinner(opts).spin(target);

}

//----------------------------------------------------------------------------
function MakeSpinnerInElement(anID,aSpinLineLen,aSpinInnerRadius,aSpinLines,aSpinLineColor,aSpinsPerSec){
var opts = {
  lines: aSpinLines, // The number of lines to draw
  length: aSpinLineLen, // The length of each line - like 8
  width: 1, // The line thickness
  radius: aSpinInnerRadius, // The radius of the inner circle
  corners: 1, // Corner roundness (0..1)
  rotate: 0, // The rotation offset
  color: aSpinLineColor, // #rgb or #rrggbb - like #555
  speed: aSpinsPerSec, // Rounds per second - like 0.5
  trail: 30, // Afterglow percentage
  shadow: false, // Whether to render a shadow
  hwaccel: false, // Whether to use hardware acceleration
  className: 'spinner', // The CSS class to assign to the spinner
  zIndex: 2e9, // The z-index (defaults to 2000000000)
  top: 'auto', // Top position relative to parent in px
  left: 'auto' // Left position relative to parent in px
  };


  var target = document.getElementById(anID);
	if(target){
		var spinner = new Spinner(opts).spin(target);
	}

}

//----------------------------------------------------------------------------
function SetWaitSize()
{
  var randomnumber = 10000 + Math.floor(Math.random()*10000);
  var thebox = document.getElementById('PageWaitDiv');

  //document.getElementById('PageWaitImage').style.display = ''; 
  //document.getElementById('PageWaitImage').src = 'images/loaderb64.gif';
  //thebox.innerHTML = thebox.innerHTML;
  //alert('SetWaitSize - here - top: '+pageTop());
  document.getElementById('PageWaitDiv').style.top = pageTop() + 'px';
  document.getElementById('PageWaitDiv').style.left = pageLeft() + 'px';
  document.getElementById('PageWaitDiv').style.height = pageHeight() + 'px';
  document.getElementById('PageWaitDiv').style.width = pageWidth() + 'px';
 
  var tempLength = pageHeight();
  var tempInnerLength = 300;
  var tempPadding = 0;
  if ( tempLength > tempInnerLength)
  {
    tempPadding = (tempLength - tempInnerLength ) / 2;
    
  }
  else
  {
    tempPadding = 0;
  }

  document.getElementById("PageWaitTable").style.marginTop = tempPadding +  "px";
  //document.getElementById("SearchOverlay").style.height = pageHeight() + "px";
  //document.getElementById("SearchOverlay").style.width = pageWidth() + "px";
  /*
  try
  {
    document.getElementById("EditOverlay").style.paddingLeft = tempPadding + "px";      
    document.getElementById("EditOverlay").style.height = pageHeight() + "px";
    document.getElementById("EditOverlay").style.width = pageWidth() + "px";
  }
  catch(err)
  {
    // item does not exist
  }
  */
  //alert('Got Here - width: '+pageWidth()+', height: '+pageHeight()+', top: '+pageTop()+', left: '+pageLeft());
}


//----------------------------------------------------------------------------
function GetDivList(matchID){
var divs = document.getElementsByTagName("div");
var divArr = [];
  for (var i = 0; i < divs.length; i++) {
    if(divs[i].id.indexOf(matchID) == 0)
      divArr.push(divs[i]);
  }
return divArr;
}


//----------------------------------------------------------------------------
function doBARaction(aBaseTableID,actionNum){
	doBARactionEx(aBaseTableID,actionNum,'');
}

//----------------------------------------------------------------------------
function doBARactionEx(aBaseTableID,actionNum,cleanParamsList){
	DebugLog('doBARaction - START - baseTableID['+ aBaseTableID +'], actionNum['+ actionNum +'], cleanParamsList['+ cleanParamsList +']');
	//GET THE VALUES
	var theTbl = document.getElementById(aBaseTableID);
	var vArrStr = '';
	var iName = '';
	var iVal = '';
	var nameLen = aBaseTableID.length + 3;
	if(theTbl){
		var barSDid = aBaseTableID + 'barSD';
		var theBarSD = document.getElementById(barSDid);
		if(theBarSD){
			DebugLog('doBARaction - have barSD');
			var barCBs = getBARcontrols(aBaseTableID);
			//BUILD PARAMS FOR THE ACTION AND ITEM LIST
			for (var i = 0; i < barCBs.length; i++){
				if(barCBs[i].checked){
					DebugLog('doBARaction - ['+ barCBs[i].id +'] is checked');
					iName = barCBs[i].id.slice(nameLen);
					iVal = barCBs[i].value;
					if(iName != 'SD'){
						DebugLog('doBARaction - ['+ barCBs[i].id +'] name is['+ iName +'], value is['+ iVal +']');
						if(vArrStr) vArrStr += ',';
						vArrStr += iName +','+ iVal;
						DebugLog('doBARaction - param str is ['+ vArrStr +']');
					}
				}
			}
		}
	}	
		
	//GET THE CURRENT URL
	var theURL = window.location.href;
	
	//DebugLog('doBARaction - clean params list['+ cleanParamsList +'] from starting URL['+ theURL +']');
	if(cleanParamsList){
		var theParamsArr = cleanParamsList.split(",");
		for(var p = 0; p < theParamsArr.length; p++) {
			//DebugLog('doBARaction - doing clean index['+ p +'], param['+ theParamsArr[p] +']');
			theURL = updateURLParameter(theURL,theParamsArr[p],''); //CLEAR THE PARAM
			//DebugLog('doBARaction - doing clean param['+ theParamsArr[p] +'] - updated URL ['+ theURL +']');
		}
	}
	//DebugLog('doBARaction - after clean params - new URL ['+ theURL +']');
	
	//DebugLog('doBARaction - adding TBAA - actionNum ['+ actionNum +']');
	theURL = updateURLParameter(theURL,'TBAA',actionNum);
	//DebugLog('doBARaction - after TBAA - updated URL ['+ theURL +']');
	
	//DebugLog('doBARaction - adding TBAIDS - vArrStr ['+ vArrStr +']');
	theURL = updateURLParameter(theURL,'TBAIDS',vArrStr);
	//DebugLog('doBARaction - after TBAIDS - updated URL ['+ theURL +']');

	theURL = AddInterfaceLevelToURL(theURL);
	theURL = AddClientIDToURL(theURL);
	
	DebugLog('doBARaction - final URL ['+ theURL +']');
	GoToPage(theURL);
}

//----------------------------------------------------------------------------
function doBARclick(aBaseTableID){
	DebugLog('doBARclick - START - baseTableID['+ aBaseTableID +']');
	var theTbl = document.getElementById(aBaseTableID);
	if(theTbl){
		var barSDid = aBaseTableID + 'barSD';
		var theBarSD = document.getElementById(barSDid);
		if(theBarSD){
			DebugLog('doBARclick - have barSD');
			var barCBs = getBARcontrols(aBaseTableID);
			var doCheckIt = theBarSD.checked;
			DebugLog('doBARclick - top barSD is checked ['+ doCheckIt +']');
			for (var i = 0; i < barCBs.length; i++){
				if(barCBs[i].checked && !doCheckIt){
					DebugLog('doBARclick - unchecking it ['+ barCBs[i].id +']');
					barCBs[i].checked = false;
				}else if(!barCBs[i].checked && doCheckIt){
					DebugLog('doBARclick - checking it ['+ barCBs[i].id +']');
					barCBs[i].checked = true;
				}
			}
		}
	}
}


//----------------------------------------------------------------------------
function getBARcontrols(aBaseTableID){
	DebugLog('GetBARcontrols - START - baseTableID['+ aBaseTableID +']');
	var controlsArr = [];
	var theTbl = document.getElementById(aBaseTableID);
	if(theTbl){
		var barInputs = theTbl.getElementsByTagName('input');
		var matchID = aBaseTableID + 'bar';
		for (var i = 0; i < barInputs.length; i++) {
			if(barInputs[i].id.indexOf(matchID) == 0){
				DebugLog('getBARcontrols - adding ['+ barInputs[i].id +']');
				controlsArr.push(barInputs[i]);
			}
		}
	}
return controlsArr;
}



//----------------------------------------------------------------------------
function fixCurrentURL(newURL){
	DebugLog('fixCurrentURL - START - newURL['+ newURL +']');
	window.history.replaceState({}, document.title, "/" + newURL);
}


//----------------------------------------------------------------------------
function GetDivsByClassList(anElement,aClassName){
	if(anElement){
		var divs = anElement.getElementsByTagName("div");
	}else{
		var divs = document.getElementsByTagName("div");
	}
	
	var divArr = [];
	for (var i = 0; i < divs.length; i++) {
		if(HasClassName(divs[i],aClassName))
			divArr.push(divs[i]);
	}
return divArr;
}


//----------------------------------------------------------------------------
function GetDivListByAttrib(anAttribName){
var divs = document.getElementsByTagName("div");
var divArr = [];
  for (var i = 0; i < divs.length; i++) {
    if(divs[i].getAttribute(anAttribName))
      divArr.push(divs[i]);
  }
return divArr;
}

//----------------------------------------------------------------------------
function GetChildDivListByAttrib(anElement,anAttribName){
	if(anElement){
		var divs = anElement.getElementsByTagName("div");
	}else{
		var divs = document.getElementsByTagName("div");
		
	}
	var divArr = [];
  for (var i = 0; i < divs.length; i++) {
    if(divs[i].getAttribute(anAttribName))
      divArr.push(divs[i]);
  }
return divArr;
}

//----------------------------------------------------------------------------
function FindAllModules(){
var divArr = GetDivListByAttrib('data-im-f');	
var modURL = '';
var theDiv;
var attribs;
var thesecs = 0;
var thecount = 0;
var firstload = 0;
var refresh = 0;
	DebugLog('FindAllModules - START');
  if(divArr){
    for(var i = 0; i < divArr.length; i++) {
      DebugLog('FindAllModules - div['+ (i+1) +'], the id['+ divArr[i].id +']');
			theDiv = divArr[i];
			attribs = 'F=' + theDiv.getAttribute('data-im-f');
			if(theDiv.getAttribute('data-im-u')) attribs = attribs + '&U='+theDiv.getAttribute('data-im-u');
			if(theDiv.getAttribute('data-im-c')) attribs = attribs + '&C='+theDiv.getAttribute('data-im-c');
			if (theDiv.getAttribute('data-im-d')) attribs = attribs + '&D=' + theDiv.getAttribute('data-im-d');
			if (theDiv.getAttribute('data-im-cd')) attribs = attribs + '&cd=' + theDiv.getAttribute('data-im-cd');
			if(theDiv.getAttribute('data-im-fl')) firstload = parseInt(theDiv.getAttribute('data-im-fl'));
			if(theDiv.getAttribute('data-im-rf')) refresh = parseInt(theDiv.getAttribute('data-im-rf'));
			// IC= iteration count - theCount
			modURL =  GetPathRelToSys() + 'process/doProcess-LoadModule.asp?' + attribs;
			doProcessDivEx(theDiv.id,modURL,IModuleDone,10000,firstload,refresh);
    }
  }	
}

//----------------------------------------------------------------------------
function IModuleDone(retID,retContent,retMessage){

	DebugLog('IModuleDone - START');
	var thediv;
	if(retID){
		thediv = document.getElementById(retID);
	}
	DebugLog('IModuleDone - id['+retID+']');
	DebugLog('IModuleDone - message['+retMessage+']');
	DebugLog('IModuleDone - len content['+retContent.length+']');
	
	if(thediv){
		DebugLog('IModuleDone - accessing div id['+thediv.id+']');
		thediv.innerHTML = retContent;
	}else{
		DebugLog('IModuleDone - could not find div id['+retID+']');
	}

	
}

//THESE FUNCTIONS ARE USED IN CONJUNCTION WITH THE class-tpTable OBJECT ALLOWING
//FOR THE SEPARATE HEADER ROW FROM THE SCROLLABLE DATA ROWS - WE NEED JS TO
//ALIGN THE COLUMN WIDTHS AFTER THE DATA GRID HAS BEEN SETUP
//----------------------------------------------------------------------------
function SyncTableHeader(aTable){
	DebugLog('SyncTableHeader - set timer for syncing table headers for table ['+ aTable +']');
  setTimeout('SyncTableHeaderWait("'+ aTable +'")',500);
}

//----------------------------------------------------------------------------
function SyncTableHeaderWait(aTable){
var tbl = document.getElementById(aTable);
  if(tbl){
		DebugLog('SyncTableHeaderWait - syncing table headers cols ['+ aTable +']');
    SyncTableHeaderCols(aTable);
  }else{
    setTimeout('SyncTableHeaderWait("'+ aTable +'")',250);
  }
}


//----------------------------------------------------------------------------
function GetChildElementByID(anElement,aID){
	if(anElement){
	DebugLog('GetChildElementByID - parent element ['+anElement+'], child ID to find['+ aID +']');
	//var c = document.body.children;
	//var i;
	//for (i = 0; i < c.length; i++) {
	//	c[i].style.backgroundColor = "red";
	//}
	}else{
		DebugLog('GetChildElementByID - parent element NOT FOUND for child id['+ aID +']');
	}
}


//----------------------------------------------------------------------------
function SyncTableHeaderCols(aTable){
DebugLog('SyncTableHeaderCols: '+aTable);
var tbl = document.getElementById(aTable);
var headName = '';
var firstName = '';
var headRow;
var headCell;
var firstCell;
var i;
var maxcol;
var cellwidth;
var startcolindex = 0;
  // Header Table: aTable + "HEADTABLE"
  // header row of table: aTable + HEADER  , num of cols set in this obj as attribute: TblColCount
  // header cells of table: aTable + HRCOL#


  if(tbl){
    headName = aTable+'HEADER';
    headRow = document.getElementById(headName);
    if(headRow){
      DebugLog('SyncTableHeaderCols - got header row object ['+headName+']');
      maxcol = headRow.getAttribute('tblcolcount');
      DebugLog('SyncTableHeaderCols - max col ['+ maxcol +'], row width['+ headRow.clientWidth +']');
 
			var endDiff = 0;
			firstName = aTable+'FRCOL' + startcolindex;
			firstCell = document.getElementById(firstName);
			if(firstCell){
				var firstRowElement = firstCell.parentElement;
				endDiff = headRow.clientWidth - firstRowElement.clientWidth
				DebugLog('SyncTableHeaderCols - first row(zero) width['+ firstRowElement.clientWidth +'], difference with header row['+ endDiff +']');
			}else{
				startcolindex = 1;	
				firstName = aTable+'FRCOL' + startcolindex;
				firstCell = document.getElementById(firstName);	
				if(firstCell){
					var firstRowElement = firstCell.parentElement;
					endDiff = headRow.clientWidth - firstRowElement.clientWidth
					DebugLog('SyncTableHeaderCols - first row(1) width['+ firstRowElement.clientWidth +'], difference with header row['+ endDiff +']');
				}				
			}
			
			for(i=startcolindex;i<=maxcol;i++){
        headName = aTable+'HRCOL'+i;
        headCell = document.getElementById(headName);
        firstName = aTable+'FRCOL'+i;
        firstCell = document.getElementById(firstName);
        if(firstCell){
          cellwidth = firstCell.clientWidth;
          DebugLog('SyncTableHeaderCols - first row cell ['+firstName+'] = '+ cellwidth);
          if(headCell){
						if(i == maxcol){cellwidth = cellwidth + endDiff;}
            headCell.style.width = cellwidth+'px';
            DebugLog('SyncTableHeaderCols - header row cell ['+headName+'] is now: '+ headCell.style.width);
          }
          
        }else{
          DebugLog('SyncTableHeaderCols - first row cell not found for ['+firstName+']');
        }
      
      }
      
      
    }else{
      DebugLog('SyncTableHeaderCols - header row object not found ['+headName+']');
    }
  
  }else{
    DebugLog('SyncTableHeaderCols - table object not found ['+aTable+']');
  }

}


//----------------------------------------------------------------------------
function encodeURIparam(aValue){
	var retval = aValue;
	retval = retval.replace(/&/g,'%26');
	retval = retval.replace(/\//g,'%2F');
	retval = retval.replace('=','%3D');
	retval = retval.replace(':','%3A');
	retval = retval.replace('?','%3F');	
	retval = retval.replace('-','%2D');	
	retval = retval.replace('[','%5B');	
	retval = retval.replace(']','%5D');	
	retval = retval.replace('.','%2E');	
	retval = retval.replace('@','%64');	
	retval = retval.replace('+','%43');	
	retval = retval.replace('$','%36');	
	retval = retval.replace(',','%44');	
	retval = retval.replace('.','%2E');		

	retval = retval.replace(';','%3B');	
	retval = retval.replace('#','%23');	
	retval = retval.replace('"','%22');	
	retval = retval.replace('\'','%27');		
	retval = retval.replace(' ','%20');
	return retval;
}


//----------------------------------------------------------------------------
function decodeURIparam(aValue){
	var retval = aValue;
	retval = retval.replace('%26','&');
	retval = retval.replace('%2F','/');
	retval = retval.replace('%3D','=');
	retval = retval.replace('%3A',':');
	retval = retval.replace('%3F','?');	
	retval = retval.replace('%2D','-');	
	retval = retval.replace('%5B','[');	
	retval = retval.replace('%5D',']');	
	retval = retval.replace('%2E','.');	
	retval = retval.replace('%64','@');	
	retval = retval.replace('%43','+');	
	retval = retval.replace('%36','$');	
	retval = retval.replace('%44',',');	
	retval = retval.replace('%2E','.');		
	
	retval = retval.replace('%3B',';');	
	retval = retval.replace('%23','#');	
	retval = retval.replace('%22','"');	
	retval = retval.replace('%27','\'');
	retval = retval.replace('%20',' ');		
	return retval;
}


//----------------------------------------------------------------------------
function DoRunAsync(aDivID,aPID,aCID,aCodeFilePath,addlParams){
	
	DebugLog('DoRunAsync - START - code['+aCodeFilePath+']');
	var codepath = encodeURIparam(aCodeFilePath);
	var params = encodeURIparam(addlParams);
	var curURL = encodeURIparam(window.location.href);
	DebugLog('current url: '+window.location.href);
	
	//var execPath = 'http://www.weo1.com/sys/process/doProcess-RunCode.asp?C='+aCID+'&P='+aPID+'&CP='+codepath+'&AP='+params;
	//var execPath = '/sys/process/doProcess-RunCode.asp?C='+aCID+'&P='+aPID+'&CP='+codepath+'&AP='+params;
	//var execPath = 'rel:/sys/process/doProcess-RunCode.asp?C='+aCID+'&P='+aPID+'&CP='+codepath+'&AP='+params;
	var execPath = 'rel:/sys/process/doProcess-RunCode.asp?C='+aCID+'&P='+aPID+'&CP='+codepath+'&AP='+params+'&CU='+curURL;
	//ProcessAction(execPath,aMsgDiv,aDivID);
	
	SetupDynDivExtraParam(aDivID,'execPath',execPath); //ADD THIS PARAM TO THE DYN DIV SO WE CAN USE IT
	//SetupDynDiv(theDiv,actionCallback,finishCallback,waitTimeToLoad,altLoadText,altFailedText) 
	SetupDynDiv(aDivID,RunAsyncGet,RunAsyncFinish,0,'','Could not load code: '+aCodeFilePath); //DON'T SET A REFRESH TIMER
	DynDivRefreshAuto(aDivID); //RUN THE FIRST REFRESH RIGHT NOW
	
	DebugLog('DoRunAsync - FINISH');
}

//----------------------------------------------------------------------------
function RunAsyncGet(aDivID,theURL){
  var retURL = GetDynDivExtraParam(aDivID,'execPath');
	DebugLog('RunAsyncGet - for ['+aDivID+'], retURL['+retURL+']');
return retURL;
}

//----------------------------------------------------------------------------
function RunAsyncFinish(aDivID){
  DebugLog('RunAsyncFinish - for ['+aDivID+']');
return true;	
}




var ProcessActionNameCounter = 0;

//----------------------------------------------------------------------------
function ProcessAction(doProcessURL,resultMsgDiv,refreshDivID){
	ProcessActionNameCounter = ProcessActionNameCounter + 1;	
	var msgDiv;
	var msgDivName;
	if(resultMsgDiv){
		msgDiv = document.getElementById(resultMsgDiv);
		msgDivName = resultMsgDiv;
	}else{
		msgDivName = 'PrAcM'+ProcessActionNameCounter;
		DebugLog('ProcessAction - building and adding message div['+msgDivName+']');
		var tmpMsgDivHTML = '<div id="'+msgDivName+'" style="display:block;position:fixed;top:1px;left:1px;width:auto;height:auto;border:1px solid blue;padding:10px;visibility:hidden;"></div>';
		document.body.innerHTML += tmpMsgDivHTML; //ADD IT TO THE PAGE
		msgDiv = document.getElementById(msgDivName);
	}
	
	var tmpDivName = 'PrAc'+ProcessActionNameCounter;
	var tmpDivHTML = '<div id="'+tmpDivName+'" style="visibility:hidden;"></div>'; // WE MAKE A LITTLE TEMP DIV TO BE OUR DATA STRUCTURE
	//var tmpDivHTML = '<div id="'+tmpDivName+'" style="display:inline-block;position:relative;width:100px;height:10px;border:1px solid red;">hello</div>'; // WE MAKE A LITTLE TEMP DIV TO BE OUR DATA STRUCTURE
	var tmpDiv;

  if(msgDiv){
    DebugLog('ProcessAction - url['+doProcessURL+'], result div['+resultMsgDiv+']');
    msgDiv.innerHTML = tmpDivHTML; //PUT OUR LITTLE DIV INSIDE THE MESSAGE DIV FOR NOW
    tmpDiv = document.getElementById(tmpDivName); //NOW GET THE DIV SO WE CAN PUT SOME STUFF IN THERE
    if(tmpDiv){
      tmpDiv.PAURL = doProcessURL; //PUT THE ACTION URL IN TO THE NEW DIV
      tmpDiv.PAPDV = resultMsgDiv; //STORE THE PARENT MSG DIV TOO
      tmpDiv.PARFD = refreshDivID; //STORE THE REFRESH DIV TOO
      
      SetupDynDiv(tmpDivName,ProcessActionGet,ProcessActionFinish,1,'',''); //SETUP THE DYNDIV IN THE TEMP DIV SO WE CAN GO GET THE VALUES 
    
    }else{
      DebugLog('ProcessAction - tmpDiv['+tmpDivName+'] could not be setup');
    }
    
  
  }else{
    DebugLog('Could not locate the message div ['+resultMsgDiv+']');
  }

}

//----------------------------------------------------------------------------
function ProcessActionGet(theDiv){
var retURL = '';
var dynDiv = document.getElementById(theDiv);
  if(dynDiv){
    retURL = dynDiv.PAURL;
    DebugLog('ProcessActionGet for ['+theDiv+'] - action URL is ['+retURL+'].');
  }else{
    DebugLog('ProcessActionGet for ['+theDiv+'] - could not get the internal div.');
  }
  
return retURL;
}


//----------------------------------------------------------------------------
function ProcessActionFinish(theDiv){
var dynDiv = document.getElementById(theDiv);
var msgDiv;
var aRefreshDivID;

  if(dynDiv){
    DebugLog('ProcessActionFinish for ['+theDiv+'] - ok.');
    if(dynDiv.PAPDV){
      msgDiv = document.getElementById(dynDiv.PAPDV);
      if(msgDiv){
        DebugLog('ProcessActionFinish for ['+theDiv+'] - got parent mesage div ['+dynDiv.PAPDV+'].');
        if(hasDynDivLoaded(theDiv)){
          DebugLog('ProcessActionFinish for ['+theDiv+'] - dyndiv has loaded.');
          if(dynDiv.innerHTML){
            DebugLog('ProcessActionFinish for ['+theDiv+'] - dyn div has some innerHTML.');
            msgDiv.innerHTML = dynDiv.innerHTML;
            
            aRefreshDivID = dynDiv.PARFD; //WE MAY OR MAY NOT HAVE A DIV TO REFRESH AT THE END
            if(aRefreshDivID){
              DebugLog('ProcessActionFinish for ['+theDiv+'] - dyn div has a refreshDiv['+ aRefreshDivID +']');
              DynDivRefresh(aRefreshDivID);
              
            }else{
              DebugLog('ProcessActionFinish for ['+theDiv+'] - dyn div has no refreshDiv.');
            }
            
          }else{
            DebugLog('ProcessActionFinish for ['+theDiv+'] - dyn div has no innerHTML.');
          }
        }else{
          DebugLog('ProcessActionFinish for ['+theDiv+'] - dyn div have not loaded.');
        }
      }else{
        DebugLog('ProcessActionFinish for ['+theDiv+'] - could not get parent message div.');
      }
    }else{
      DebugLog('ProcessActionFinish for ['+theDiv+'] - parent message div was not set.');
    }
  }else{
    DebugLog('ProcessActionFinish for ['+theDiv+'] - could not get the internal div.');
  }
}



var SetupDynDivRetryCount = 0;


//----------------------------------------------------------------------------
function SetupDynDivExtraParam(aDivID,paramName,paramValue){
	var theDivBox = document.getElementById(aDivID);
  if(theDivBox != null){
		var newAttrName = 'xmlhttp'+paramName;
		theDivBox.setAttribute(newAttrName,paramValue);
		DebugLog('SetupDynDivExtraParam - for ['+aDivID+'], new attribute['+newAttrName+'], value['+paramValue+']');
	}	
}

//----------------------------------------------------------------------------
function GetDynDivExtraParam(aDivID,paramName){
	var retVal = '';
	var theDivBox = document.getElementById(aDivID);
  if(theDivBox != null){
		var newAttrName = 'xmlhttp'+paramName;
		retVal = theDivBox.getAttribute(newAttrName);
		DebugLog('GetDynDivExtraParam - for ['+aDivID+'], new attribute['+newAttrName+'], return value['+retVal+']');
	}		
	return retVal;
}


function killDynDivLoads(){
	
	DebugLog('killDynDivLoads - - - - - - - - - - - - - - -');
	var dynListLen = g_DynDivs.length
	var theDiv;
	
	for(var i = 0; i < dynListLen; i++){
		theDiv = g_DynDivs[i];
		if(theDiv){
			DebugLog('killDynDivLoads: i('+i+'), div name: '+theDiv.id+', inProcess: '+theDiv.getAttribute('xmlhttpInProcess'));
			theDiv.setAttribute('xmlhttpKillRequest',true);
			theDiv.xmlhttpObj.abort; 
		}
	}
	
}



var g_DynDivs = []; // array of dyn divs

//----------------------------------------------------------------------------
// the dyn div will pull content dynamically
function SetupDynDiv(theDiv,actionCallback,finishCallback,waitTimeToLoad,altLoadText,altFailedText) {
var theDivBox = document.getElementById(theDiv); 
var fullActionCallback = actionCallback;
var doKillIt = false;

  DebugLog('SetupDynDiv: START - div['+theDiv+']');
  
  if(theDivBox != null){
    //WE LOAD THE HTTP OBJ INTO THE DIV OBJ ITSELF
    theDivBox.xmlhttpObj = GetXmlHttpObject(); //SETUP FOR THE POSTBACK PROCESSING
    theDivBox.xmlhttpCallback = fullActionCallback; //THE ACTION CALLBACK WHEN THE DIV GOES TO GET INFO
    theDivBox.xmlhttpFinishCallback = finishCallback; //THE FINISH CALLBACK WHEN THE DIV CONTENT IS LOADED
    theDivBox.setAttribute('xmlhttpInitialWait',waitTimeToLoad); //HOW LONG TO WAIT TO INITIALLY REFRESH THIS DYN DIV
    theDivBox.setAttribute('xmlhttpInitialLoad',false);
    theDivBox.setAttribute('xmlhttpLoadCount',0);
    theDivBox.setAttribute('xmlhttpInProcess',false);
		theDivBox.setAttribute('xmlhttpKillRequest',false);
    DebugLog('SetupDynDiv - div['+theDiv+'] - xmlhttpInitialLoad['+theDivBox.getAttribute('xmlhttpInitialLoad')+']');
		
		g_DynDivs.push(theDivBox); //ADD THE DIV TO OUR REFERENCE LIST
		
    //STORE THE APPROPRIATE FAIL TEXT INTO THE DIV OBJ
    if(altFailedText != null){
      if(altFailedText != ''){
        theDivBox.setAttribute('xmlhttpFailText',altFailedText); 
      }
      else{
        theDivBox.setAttribute('xmlhttpFailText','<i>load failed</i>'); 
      }
    }
    else{
      theDivBox.setAttribute('xmlhttpFailText','<i>load failed</i>'); 
    }

    if(altLoadText != null){
      if(altLoadText != ''){
        theDivBox.setAttribute('xmlhttpLoadText',altLoadText); 
      }
      else{
        theDivBox.setAttribute('xmlhttpLoadText','<i>loading...</i>'); 
      }
    }
    else{
      theDivBox.setAttribute('xmlhttpLoadText','<i>loading...</i>'); 
    }
    
    //------ SET THE CALLBACK FUNCTION FOR THE DIV HTTP OBJECT
      theDivBox.xmlhttpObj.onreadystatechange=function()
      {
        //DebugLog('xmlhttpObj Callback: current readyState is: '+theDivBox.xmlhttpObj.readyState);
        if (theDivBox.xmlhttpObj.readyState==4 && theDivBox.xmlhttpObj.status==200)
        {
          //DebugLog('xmlhttpObj Callback: object is now ready: '+theDiv);
          theDivBox.setAttribute('xmlhttpInProcess','false'); //MARK IT AS NO LONGER IN PROCESS, A FLAG JUST FOR US
          HideDivWait(theDiv); //IF WE ARE SHOWING THE SPINNER, THEN TURN IT OFF
          
          //IF WE HAVE NO RESPONSE, THEN SHOW OUR PROVIDED OR DEFAULT FAILED MESSAGE
          if(theDivBox.xmlhttpObj.responseText == ''){
						//DebugLog('xmlhttpObj Callback: we have no response, lets fail now');
            theDivBox.innerHTML = theDivBox.getAttribute('xmlhttpFailText');
          }
          else {
            //HEY, WE GOT A RESPONSE, SO POP THAT INTO THE DIV
						//DebugLog('xmlhttpObj Callback: we got a response, use it - state['+theDivBox.xmlhttpObj.readyState+'], status['+theDivBox.xmlhttpObj.status+']');
						theDivBox.innerHTML = theDivBox.xmlhttpObj.responseText; 
          }
          
          //IF WE HAVE A CALLBACK TO DO AFTER WE'RE DONE, THEN DO IT
          if(theDivBox.xmlhttpFinishCallback != null){
						//DebugLog('xmlhttpObj Callback: have a callback routine, so jump to that');
            theDivBox.xmlhttpFinishCallback(theDiv);
          }
        }
        else{
          if(theDivBox.xmlhttpObj){
						//DebugLog('xmlhttpObj have it');
            if(theDivBox.xmlhttpObj.readyState){
							//DebugLog('xmlhttpObj have ready state');
              if(theDivBox.xmlhttpObj.readyState > 1){
                //DebugLog('xmlhttpObj Callback: readyState is: '+theDivBox.xmlhttpObj.readyState.toString());
              }
              else{
                //DebugLog('xmlhttpObj Callback: readyState is < 2');
              }
            }
            else{
              //DebugLog('xmlhttpObj Callback: readyState not valid');
            }
          }
          else{
            //DebugLog('xmlhttpObj Callback: xmlhttpObj not valid');
          }
        }
      }
    //---------
    
    //NOW SETUP THE INITIAL REFRESH IF REQUESTED
    if((waitTimeToLoad != '') &&(waitTimeToLoad != 0)){
      initRefreshCall = 'DynDivRefreshAuto("'+theDiv+'")'; //CALL THE AUTO REFRESH ROUTINE
      DebugLog('SetupDynDiv: setting up timeout for auto-refresh: '+waitTimeToLoad);
      setTimeout(initRefreshCall,waitTimeToLoad);
    }
    else{
      //DO NOTHING, WE WILL WAIT FOR A MANUAL CALL TO DYNDIVREFRESH
      DebugLog('SetupDynDiv: not setting up timeout refresh');
    }
  }
  else{
    
		
		//DebugLog('SetupDynDiv: ['+theDiv+'] xmlhttpKillRequest value is ['+theDivBox.getAttribute('xmlhttpKillRequest')+']');
		//if(theDivBox.getAttribute('xmlhttpKillRequest') == 'true'){
		//	doKillIt = true;
		//	DebugLog('SetupDynDiv: ['+theDiv+'] - setting doKillIt');
		//}
		
		if(!doKillIt){
			var bailout = false;
			SetupDynDivRetryCount = SetupDynDivRetryCount + 1;
			if(SetupDynDivRetryCount < 100){
				if(SetupDynDivRetryCount > 3){
					var parentDivName = theDiv.replace('Content','');
					var parentDiv = document.getElementById(parentDivName); 
					if(!parentDiv){
						DebugLog('SetupDynDiv: the parent div is not present, so bail out ['+ parentDivName+']');
						bailout = true;
					}
				}
				
				if(!bailout){
					DebugLog('SetupDynDiv: is still null, try again: '+ SetupDynDivRetryCount);
					//SetupDynDiv(theDiv,actionCallback,finishCallback,waitTimeToLoad,altLoadText,altFailedText)
					var thefunccall = 'SetupDynDiv("'+ theDiv +'",'+ fullActionCallback +','+ finishCallback +','+ waitTimeToLoad +',"'+ altLoadText +'","'+ altFailedText +'")';
					var newwaittime = 100 * SetupDynDivRetryCount;
					setTimeout(thefunccall,newwaittime); //TRY AGAIN 
				}
			}else{
				DebugLog('SetupDynDiv: is still null, all retries have failed');
			}
		}else{
			DebugLog('SetupDynDiv: skipping because doKillIt is set');
		}
  }
}  


//----------------------------------------------------------------------------
// RETURNS TRUE IF AT LEAST ONE REFRESH HAS BEEN DONE
function hasDynDivLoaded(theDiv) {
var theDivBox = document.getElementById(theDiv);
 
  if(theDivBox != null){
    if(theDivBox.getAttribute('xmlhttpInitialLoad') != null){
      return theDivBox.getAttribute('xmlhttpInitialLoad');
    }
    else{
      return false;
    }
  }
  else{
    return false;
  }
}


//----------------------------------------------------------------------------
// RETURNS TRUE IF AT LEAST ONE REFRESH HAS BEEN DONE
function getDynDivLoadCount(theDiv) {
var theDivBox = document.getElementById(theDiv);
 
  if(theDivBox != null){
    if(theDivBox.getAttribute('xmlhttpInitialLoad') != null){
      return theDivBox.getAttribute('xmlhttpInitialLoad');
    }
    else{
      return 0;
    }
  }
  else{
    return 0;
  }
}

//----------------------------------------------------------------------------
// RETURNS TRUE IF THE DYN DIV IS ACTIVELY GETTING THE CONTENT
function isDynDivInProcess(theDiv) {
var theDivBox = document.getElementById(theDiv);
 
  if(theDivBox != null){
    return theDivBox.getAttribute('xmlhttpInProcess');
  }
  else{
    return false;
  }
}


var g_WaitForDynDivRefresh = false;
var g_WaitForDynDivTimerSet = false

function PrepDynRefresh(theDiv){
	DebugLog('PrepDynRefresh - START for ['+theDiv+']');
	g_WaitForDynDivRefresh = true;
	if(!g_WaitForDynDivTimerSet){
		CheckDynRefresh(theDiv);
	}

}

function CheckDynRefresh(theDiv){
	if(g_WaitForDynDivRefresh){
		g_WaitForDynDivRefresh = false;
		g_WaitForDynDivTimerSet = true;
		setTimeout('CheckDynRefresh("'+theDiv+'")',500);
	}else{
		g_WaitForDynDivTimerSet = false;
		DebugLog('CheckDynRefresh - OK refresh the div ['+theDiv+']');
		DynDivRefresh(theDiv);
	}
}

//----------------------------------------------------------------------------
// THIS ROUTINE IS CALLED BY THE AUTO INITIAL LOAD TIMER, WILL ONLY LOAD THE CONTENT
// IF IT HASN'T BEEN LOADED AND ISN'T LOADING RIGHT NOW
function DynDivRefreshAuto(theDiv) {
var theDivBox = document.getElementById(theDiv); 
DebugLog('DynDivRefreshAuto: starting for DIV: '+theDiv);
  if(theDivBox != null){
    //IF WE HAVEN'T ALREADY DONE ONE LOAD AND WE AREN'T LOADING IT RIGHT NOW
		DebugLog('DynDivRefreshAuto: ['+theDiv+'] xmlhttpInitialLoad['+theDivBox.getAttribute('xmlhttpInitialLoad')+'], xmlhttpInProcess['+theDivBox.getAttribute('xmlhttpInProcess')+']');

    if((theDivBox.getAttribute('xmlhttpInitialLoad') == 'false') && (theDivBox.getAttribute('xmlhttpInProcess') == 'false')){ 
      DebugLog('DynDivRefreshAuto: do the DynDivRefresh for: '+theDiv);
      DynDivRefresh(theDiv); 
    }else{
      DebugLog('DynDivRefreshAuto: cant auto-refresh div, it is in load or is in process');
    }
  }  
}

var DynDivRefreshRetryCount = 0;

//----------------------------------------------------------------------------
// CALL THIS ROUTINE TO GO GET THE DYNAMIC CONTENT FOR THE DYN DIV
// MUST HAVE PREVIOUSLY CALLED SetupDynDiv TO PREPARE THE DYN DIV
function DynDivRefresh(theDiv) {
var theDivBox = document.getElementById(theDiv); 
var loadURL;
var i;
var retryTime;
var doTryAgain;
var doKillIt = false;

  doTryAgain = true;
  
  //alert('DynDivRefresh start: '+theDiv);
  DebugLog('DynDivRefresh: STARTING for div['+theDiv+']');
  if(theDivBox != null){
    DebugLog('DynDivRefresh: ['+theDiv+'] got the div element');
    DebugLog('DynDivRefresh: ['+theDiv+'] xmlhttpInProcess value is ['+theDivBox.getAttribute('xmlhttpInProcess')+']');
		
		DebugLog('DynDivRefresh: ['+theDiv+'] xmlhttpKillRequest value is ['+theDivBox.getAttribute('xmlhttpKillRequest')+']');
		if(theDivBox.getAttribute('xmlhttpKillRequest') == 'true'){
			doKillIt = true;
			DebugLog('DynDivRefresh: ['+theDiv+'] KILLTEST - setting doKillIt');
		}
		
    if((theDivBox.getAttribute('xmlhttpInProcess') == 'false') && (!doKillIt)){ //IF WE AREN'T ALREADY PROCESSING
      DebugLog('DynDivRefresh: ['+theDiv+'] xmlhttpInProcess is not set, so get started');
      theDivBox.setAttribute('xmlhttpInProcess','true');
      theDivBox.setAttribute('xmlhttpInitialLoad','true');
      theDivBox.setAttribute('xmlhttpLoadCount',theDivBox.xmlhttpLoadCount + 1);
      
			theSpinMessage = '';
			if(theDivBox.getAttribute('xmlhttpLoadText') == null){
				theSpinMessage = 'loading error';
			}else{
				theSpinMessage = theDivBox.getAttribute('xmlhttpLoadText');
			}
      theDivBox.innerHTML = '<div style="font-family:arial,sanserif;font-size:10px;padding:4px;color:#999;text-align:center;margin:auto;">'+ theSpinMessage +'</div>'; 
      DebugLog('DynDivRefresh: ['+theDiv+'] go ahead and show the loading spinner');
			ShowDivWait(theDiv);

      if(theDivBox.xmlhttpCallback != null){ 
        DebugLog('DynDivRefresh: ['+theDiv+'] have a xmlhttpCallback - so get the URL');
        loadURL = theDivBox.xmlhttpCallback(theDiv); //GO GET THE URL TO HIT
        if (loadURL) {
          i = loadURL.indexOf('ERROR:'); //IF THE RETURN MESSAGE STARTS WITH "ERROR:" THEN IT IS A NON-URL RETURN MESSAGE
          if(i >= 0){
            DebugLog('DynDivRefresh: ['+theDiv+'] have an error ['+loadURL+']');
            loadURL = loadURL.replace('ERROR:','');
            theDivBox.innerHTML = loadURL;  //JUST DISPLAY THE RETURN VALUE MINUS THE LEADING ERROR: TEXT
            HideDivWait(theDiv); //HIDE THE SPINNER BECAUSE WE'RE DONE
            theDivBox.setAttribute('xmlhttpInProcess','false'); //MAKE THE DIV AS NOT IN PROCESS
            doTryAgain = false;
          }
          else{
            //OK, IT IS A URL NOT A FAIL MESSAGE
            var fullLoadURL;
            if(loadURL.indexOf('http') == 0){
              DebugLog('DynDivRefresh: ['+theDiv+'] full URL to get ['+loadURL+']');
              fullLoadURL = loadURL;
						}else if(loadURL.indexOf('rel:') == 0){
							DebugLog('DynDivRefresh: ['+theDiv+'] relative URL to get ['+loadURL+']');
							fullLoadURL = loadURL.substr(4); //TRIM OFF THE REL: PORTION
            }else{
							
							var ppos = loadURL.indexOf('process/');
							DebugLog('DynDivRefresh: position of process/ in path ['+ppos+']');
							if(ppos == 0){
								DebugLog('DynDivRefresh: has it, so leave it');
								fullLoadURL = loadURL;
							}else{
								DebugLog('DynDivRefresh: does not have it, so add it');
								fullLoadURL = 'process/'+ loadURL;
							}
              DebugLog('DynDivRefresh: ['+theDiv+'] local sys URL to get ['+fullLoadURL+']');
            }
						
						fullLoadURL = AddInterfaceLevelToURL(fullLoadURL);
						
            DebugLog('DynDivRefresh: ['+theDiv+'] doing send ['+fullLoadURL+']');
            
            theDivBox.xmlhttpObj.open('GET',fullLoadURL,true);
            theDivBox.xmlhttpObj.send();
            doTryAgain = false;
          }
        } else {
         //THIS IS AN ERROR CONDITION
         DebugLog('DynDivRefresh: ['+theDiv+'] failed to get the loadURL value from the div xmlcallback routine.');
        }
      }
      else{
        DebugLog('DynDivRefresh: ['+theDiv+'] No action xmlhttpCallback setup for dyn div ['+theDiv+']');
      }
    }
    else{
			if(doKillIt){
				DebugLog('DynDivRefresh: ['+theDiv+'] we are supposed to kill this request');
				doTryAgain = false;
			}else{
				DebugLog('DynDivRefresh: ['+theDiv+'] xmlhttpInProcess is still in process');
				doTryAgain = true;
			}
    }
  }
  else{ 
    DebugLog('DynDivRefresh: ['+theDiv+'] theDivBox is not valid yet.');    
    doTryAgain = true;
  }
  
  if(doTryAgain && (!doKillIt)){
    DebugLog('DynDivRefresh: ['+theDiv+'] doTryAgain.');    

    //IF THE DIV ISN'T THERE THEN WAIT FOR IT AND TRY AGAIN
    if(DynDivRefreshRetryCount < 17){
      DynDivRefreshRetryCount = DynDivRefreshRetryCount + 1;
      retryTime = (DynDivRefreshRetryCount * 300) + 300;
      if(theDivBox != null){
        theDivBox.setAttribute('xmlhttpInProcess','false');  //TELL THE OBJ THAT WE THINK IT SHOULD BE DONE
      }
      DebugLog('DynDivRefresh - ['+theDiv+'] retry: '+DynDivRefreshRetryCount+', retry delay: '+retryTime);
      setTimeout("DynDivRefresh('"+ theDiv+ "')",retryTime); //KICK OFF A NEW REFRESH AFTER THE WAIT TIME
      
    }else{
      //alert('DynDivRefresh - unable to reload '+theDiv+', the item is still unavailable. [ '+DynDivRefreshRetryCount+']');
      DebugLog('DynDivRefresh: ['+theDiv+'] - unable to reload, the item is still unavailable. [ '+DynDivRefreshRetryCount+']');
      //alert('Sorry.  Unable to update the dynamic information.  Please refresh the page and try again.');
    }
  }
}

 
function AddInterfaceLevelToURL(aURL){
var retURL = aURL;
	if(retURL.length > 0){
		
		//if(retURL.indexOf('?') >= 0)
		//{ 
		//	retURL = retURL + '&rz=' + Math.random(); // NEED TO ADD THIS TO PREVENT CACHING OF THIS IN THE BROWSER
		//}else{
		//	retURL = retURL + '?rz=' + Math.random(); // NEED TO ADD THIS TO PREVENT CACHING OF THIS IN THE BROWSER
		//}			
		
		retURL = updateURLParameter(retURL,'rz',Math.random());
		
		if(retURL.indexOf('&i=') >= 0){
			DebugLog('AddInterfaceLevelToURL - i param already present');	
		}else{
			if(gProcessInterfaceLevel){
				retURL = retURL + '&i=' + gProcessInterfaceLevel;
			}else{
				retURL = retURL + '&i=0';
			}
			if(gProcessSessCheck){
				retURL = retURL + '&sk=' + gProcessSessCheck;
			}else{
				retURL = retURL + '&sk=0';
			}	
		}
	}
	DebugLog('AddInterfaceLevelToURL - ret URL['+ retURL +']');
return retURL;
}


function AddClientIDToURL(aURL){
var retURL = aURL;
	if(retURL.length > 0){
		
		if((retURL.indexOf('&c=') >= 0) || (retURL.indexOf('&C=') >= 0)){
			DebugLog('AddClientIDToURL - c param already present');	
		}else{
			if(gcscID > 0){
				retURL = retURL + '&c=' + gcscID;
			}else{
				retURL = retURL + '&c=0';
			}	
		}
	}
	DebugLog('AddClientIDToURL - ret URL['+ retURL +']');
return retURL;
}


//----------------------------------------------------------------------------
function ShowDivWait(theDiv){
var opts = {
  lines: 12, // The number of lines to draw
  length: 4, // The length of each line
  width: 1, // The line thickness
  radius: 3, // The radius of the inner circle
  corners: 1, // Corner roundness (0..1)
  rotate: 0, // The rotation offset
  color: '#555', // #rgb or #rrggbb
  speed: 0.5, // Rounds per second
  trail: 30, // Afterglow percentage
  shadow: false, // Whether to render a shadow
  hwaccel: false, // Whether to use hardware acceleration
  className: 'spinner', // The CSS class to assign to the spinner
  zIndex: 2e9, // The z-index (defaults to 2000000000)
  top: 'auto', // Top position relative to parent in px
  left: 'auto' // Left position relative to parent in px
};
var divbox = document.getElementById(theDiv);
if(divbox != null){
  var thespinnername = theDiv+'Spinner';
  var thespinnerblock = '<div id="'+thespinnername+'" style="position:relative;margin:auto;margin-top:1px;width:20px;height:20px;"></div>';
  divbox.innerHTML = divbox.innerHTML + thespinnerblock; //ADD THE SPINNER DIV TO THE DIV
  var target = document.getElementById(thespinnername); //NOW GET THE OBJ FROM THE DOM
  if(target != null){
    var spinner = new Spinner(opts).spin(target);
  }
  else{
    //alert('spinner: '+thespinnername+' was not found.');
  }
}

}


//----------------------------------------------------------------------------
function HideDivWait(theDiv){

var target = document.getElementById(theDiv+'Spinner');

  if(target != null){
    target.style.visibility = 'hidden';
    target.style.display = 'none';
  
  }

}

//----------------------------------------------------------------------------
function go(theURL) {
  setTimeout(function(){ window.location.href = theURL; }, 100);
}


 //window.location.href = "mailto:user@example.com?subject=Subject&body=message%20goes%20here";
//----------------------------------------------------------------------------
function mailTo(theEmail,theSubject,theBody) {
var theurl;
DebugLog('mailto function');
  theurl = 'mailto:'+theEmail+'?subject='+theSubject+'&body='+theBody;
  window.location.href = theurl;
}

//----------------------------------------------------------------------------
function pageWidth() {return window.innerWidth != null? window.innerWidth: document.body != null? document.body.clientWidth:null;}

//----------------------------------------------------------------------------
function pageHeight() {return window.innerHeight != null? window.innerHeight: document.body != null? document.body.clientHeight:null;}

//----------------------------------------------------------------------------
function ViewPortWidth(){
var w = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
return w;
}
//----------------------------------------------------------------------------
function ViewPortHeight(){
var h = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
return h;
}

//----------------------------------------------------------------------------
function pageTop() {
  if(typeof pageYOffset!= 'undefined'){
      //most browsers
      return pageYOffset;
  }
  else{
      var B= document.body; //IE 'quirks'
      var D= document.documentElement; //IE with doctype
      D= (D.clientHeight)? D: B;
      return D.scrollTop;
  }

}

//----------------------------------------------------------------------------
function pageLeft() {
  if(typeof pageXOffset!= 'undefined'){
      //most browsers
      return pageXOffset;
  }
  else{
      var B= document.body; //IE 'quirks'
      var D= document.documentElement; //IE with doctype
      D= (D.clientWidth)? D: B;
      return D.scrollLeft;
  }
}



//----------------------------------------------------------------------------
function GetWaitDiv() {
var thediv;

  thediv = '<div  style="display:inline;position:absolute;z-index:100;left:0px;top:0px;background-color:#ccf;width:100%;height:100%;background:url(images/loaderb64.gif) no-repeat center center;"></div>';

return thediv;
}



//----------------------------------------------------------------------------
function doSetInheritCSS(inputItem,inheritItem,parentItem) {
var thefrom = document.getElementById(inheritItem);
var theto = document.getElementById(inputItem);
var theparent = document.getElementById(parentItem);
  DebugLog('doSetInheritCSS - inherit:'+inheritItem+' to input:'+ inputItem);
  if(thefrom && theto){
    DebugLog('doSetInheritCSS - copy value is ['+thefrom.innerHTML+']');
    theto.value = thefrom.innerHTML;
    if(theparent){
      theparent.style.visibility = 'hidden';
    }
  }
}

//----------------------------------------------------------------------------
function doClearCSSInput(inputItem,inheritItem,parentItem) {
var thefrom = document.getElementById(inheritItem);
var theto = document.getElementById(inputItem);
var theparent = document.getElementById(parentItem);
  DebugLog('doClearCSS - input:'+ inputItem);
  if(thefrom && theto){
    DebugLog('doClearCSS - doing clear');
    theto.value = '';
    if(theparent){
      theparent.style.visibility = '';
    }
  }
}



//----------------------------------------------------------------------------
function CopyValueFromTo(fromItem,toItem) {
var thefrom = document.getElementById(fromItem);
var theto = document.getElementById(toItem);
  DebugLog('CopyValueToFrom - '+fromItem+' to '+ toItem);
  if(thefrom && theto){
    DebugLog('CopyValueToFrom - copy value is ['+thefrom.value+']');
    theto.value = thefrom.value;
  }
}

//----------------------------------------------------------------------------
function SetInputValue(anInputID,aValue) {
var theinput = document.getElementById(anInputID);
  DebugLog('SetInputValue - input['+anInputID+'] to value['+ aValue+']');
  if(theinput){
    theinput.value = aValue;
  }
}

//----------------------------------------------------------------------------
function AllowNumberOnlyKeyPress(e) { 
	// Only allow numbers or the period character - use with OnKeyPress event - onkeypress="return AllowNumberOnlyKeyPress(event)"
	var theCode = (e.which) ? e.which : e.keyCode; 
	if((theCode >= 48 && theCode <= 57) || (theCode == 46)){
		return true; 
	}else{
		return false; 
	}
} 

//----------------------------------------------------------------------------
function CopyValueFromToByName(fromItemName,toItemName) {
var thefrom = document.getElementsByName(fromItemName)[0];
var theto = document.getElementsByName(toItemName)[0];
  DebugLog('CopyValueFromToByName - '+fromItemName+' to '+ toItemName);
  if(thefrom && theto){
    DebugLog('CopyValueFromToByName - copy value is ['+thefrom.value+']');
    theto.value = thefrom.value;
  }
}

//----------------------------------------------------------------------------
function CopyValueFromToTextArea(fromItemID,toTextAreaID) {
var thefrom = document.getElementById(fromItemID);
var theto = document.getElementById(toTextAreaID);
  DebugLog('CopyValueFromToTextArea - from control['+fromItemID+'] to textarea['+ toTextAreaID+']');
  if(thefrom && theto){
    DebugLog('CopyValueFromToTextArea - copy value is ['+thefrom.value+']');
    theto.innerHTML = thefrom.value;
  }
}

//----------------------------------------------------------------------------
function CheckAndWrapValue(editField,prefix,postfix) {
var theitem = document.getElementById(editField);
  DebugLog('CheckAndWrapValue - '+editField+', pre['+ prefix +'], posst['+ postfix +']');
  if(theitem){
    var orgVal;
    var newVal;
    orgVal = theitem.value;
    if(orgVal){
      if(orgVal.indexOf(prefix) == 0){ //PREFIX IS ALREADY THERE
        DebugLog('CheckAndWrapValue - prefix already there');
      }else{ //PREFIX IS NOT THERE
        newVal = prefix + orgVal + postfix;
        theitem.value = newVal;
      } 
    
    }else{
      DebugLog('CheckAndWrapValue - no value');
    }
    
  }
}


//----------------------------------------------------------------------------
function SetInnerHTML(anID,theHTML) {
var theItem = document.getElementById(anID);
  DebugLog('SetInnerHTML - '+anID);
  if(theItem){
    theItem.innerHTML = theHTML;
  }
}

//----------------------------------------------------------------------------
function CopyInnerHTML(fromID,toID) {
var theFrom = document.getElementById(fromID);
var theTo = document.getElementById(toID);
  DebugLog('CopyInnerHTML - from['+ fromID +'] to['+ toID +']');
  if(theFrom){
		if(theTo){
			theTo.innerHTML = theFrom.innerHTML;
		}else{
			DebugLog('CopyInnerHTML - failed to find the target item['+toID+']');
		}
  }else{
		DebugLog('CopyInnerHTML - failed to find the source item['+fromID+']');
	}
}

//----------------------------------------------------------------------------
function CopyInnerHTMLAndShow(fromID,toID) {
var theFrom = document.getElementById(fromID);
var theTo = document.getElementById(toID);
  DebugLog('CopyInnerHTMLAndShow - from['+ fromID +'] to['+ toID +']');
  if(theFrom){
		if(theTo){
			theTo.innerHTML = theFrom.innerHTML;
			theTo.visibility = '';
		}else{
			DebugLog('CopyInnerHTMLAndShow - failed to find the target item['+toID+']');
		}
  }else{
		DebugLog('CopyInnerHTMLAndShow - failed to find the source item['+fromID+']');
	}
}



//----------------------------------------------------------------------------
function startRotateChildDivs(parentDivID,theDelay,showClassName,hideClassName){
var divContainer = document.getElementById(parentDivID);
	if(parentDivID){
		setTimeout("doRotateChildDivs('"+parentDivID+"',"+theDelay+",'"+showClassName+"','"+hideClassName+"');",theDelay);
	}else{
		setTimeout("startRotateChildDivs('"+parentDivID+"',"+theDelay+",'"+showClassName+"','"+hideClassName+"');",1000);		
	}
}

//----------------------------------------------------------------------------
function doRotateChildDivs(parentDivID,theDelay,showClassName,hideClassName){
var divContainer = document.getElementById(parentDivID);
	if(parentDivID){
		//DebugLog('doRotateChildDivs - START');
		RotateChildDivs(parentDivID,showClassName,hideClassName);
		setTimeout("doRotateChildDivs('"+parentDivID+"',"+theDelay+",'"+showClassName+"','"+hideClassName+"');",theDelay);
	}	
}



//----------------------------------------------------------------------------
function RotateChildDivs(parentDivID,showClassName,hideClassName){
var divContainer = document.getElementById(parentDivID);
var thecName;
var theShowDiv = -1;
var theCurCount = 0;
var theMaxCount = 0;
var theNextDiv = 0;

	if(divContainer){
		//DebugLog('RotateChildDivs - START');
		var divArr = divContainer.getElementsByTagName("div");
		var divArr = GetChildDivListByAttrib(divContainer,"data-artlist-num");
		if(divArr){
			for(var i = 0; i < divArr.length; i++) {
				theCurCount = divArr[i].getAttribute('data-artlist-num');
				if(theCurCount > theMaxCount){ theMaxCount = theCurCount; }
				if(HasClassName(divArr[i],showClassName)){theShowDiv = i;}
			}
			if(theShowDiv >= 0){
				theNextDiv = theShowDiv + 1;
			}else{
				theNextDiv = 0;
			}
			if(theNextDiv >= divArr.length){theNextDiv = 0;}
			//DebugLog('RotateChildDivs - curShow['+theShowDiv+'], newShow['+theNextDiv+']');
			for(var i = 0; i < divArr.length; i++) {
				//DebugLog('RotateChildDivs - i['+i+'], class['+divArr[i].className+']');
				if(i == theShowDiv){
					//DebugLog('RotateChildDivs - hiding the show at i['+i+']'); 
					SwapClassForElement(divArr[i],showClassName,hideClassName);
				}else if(i == theNextDiv){
					//DebugLog('RotateChildDivs - showing the next hide at i['+i+'], show['+showClassName+'], hide['+hideClassName+']'); 
					SwapClassForElement(divArr[i],hideClassName,showClassName);
				}
			}
		}
	}
}



//----------------------------------------------------------------------------
function DivSelect(matchDivs,aSelectID){
var divArr = GetDivList(matchDivs);
var theSelName;

  if(divArr){
    theSelName = matchDivs + aSelectID;
    //alert('DivSelect - the selected div ['+theSelName+']');
    for(var i = 0; i < divArr.length; i++) {
      if(divArr[i].id.match(theSelName)){
        //alert('DivSelect - location div ['+divArr[i].id+'] - showing div');
        divArr[i].style.visibility = '';
      }else{
        //alert('DivSelect - location div ['+divArr[i].id+'] - hidding div');
        divArr[i].style.visibility = 'hidden';
      }
    }
  }
}



//----------------------------------------------------------------------------
function DivSelectClass(matchDivs,aSelectID,selectClassName){
var divArr = GetDivList(matchDivs);
var theSelName;

  if(divArr){
    theSelName = matchDivs + aSelectID;
    //alert('DivSelect - the selected div ['+theSelName+']');
    for(var i = 0; i < divArr.length; i++) {
      if(divArr[i].id.match(theSelName)){
        //alert('DivSelect - location div ['+divArr[i].id+'] - adding class');
        AddClass(theSelName,selectClassName);
      }else{
        //alert('DivSelect - location div ['+divArr[i].id+'] - removing class');
        RemoveClass(divArr[i].id,selectClassName);
      }
    }
  }
}

//----------------------------------------------------------------------------
function DivSelectClassSwap(matchDivs,aSelectID,selectClassName,nonSelectClassName){
var divArr = GetDivList(matchDivs);
var theSelName;

  if(divArr){
    theSelName = matchDivs + aSelectID;
    for(var i = 0; i < divArr.length; i++) {
      if(divArr[i].id.match(theSelName)){
        SwapClass(theSelName,nonSelectClassName,selectClassName);
      }else{
        SwapClass(divArr[i].id,selectClassName,nonSelectClassName);
      }
    }
  }
}

//----------------------------------------------------------------------------
function AllDivClassSwap(curClassName,newClassName){
var divArr = document.getElementsByTagName("div");
  if(divArr){
    for(var i = 0; i < divArr.length; i++) {
      SwapClassForElement(divArr[i],curClassName,newClassName);
    }
  }
}

//----------------------------------------------------------------------------
function FirstDivClassSwap(curClassName,newClassName){
var divArr = document.getElementsByTagName("div");
var thecName;
  if(divArr){
		var didOne = false;
    for(var i = 0; i < divArr.length; i++) {
      didOne = SwapClassForElement(divArr[i],curClassName,newClassName);
			if(didOne){
				//DebugLog('FirstDivClassSwap - did it - ['+curClassName+'] and ['+newClassName+']');
				i = divArr.length;
			}else{
				thecName = divArr[i].className;
				if(HasClassName(divArr[i],newClassName)){
					//DebugLog('FirstDivClassSwap - found newclass there, we are done');
					i = divArr.length;					
				}
			}
    }
  }
}

//----------------------------------------------------------------------------
function FirstElementClassSwap(aTagName,curClassName,newClassName){
var divArr = document.getElementsByTagName(aTagName);
var thecName;
  if(divArr){
		var didOne = false;
    for(var i = 0; i < divArr.length; i++) {
      didOne = SwapClassForElement(divArr[i],curClassName,newClassName);
			if(didOne){
				//DebugLog('FirstElementClassSwap - did it - ['+curClassName+'] and ['+newClassName+']');
				i = divArr.length;
			}else{
				thecName = divArr[i].className;
				if(HasClassName(divArr[i],newClassName)){
					//DebugLog('FirstElementClassSwap - found newclass there, we are done');
					i = divArr.length;					
				}
			}
    }
  }
}
//----------------------------------------------------------------------------
function GetDivTopByID(aDivID,aPercentOfHeight){
var aEle = document.getElementById(aDivID);
var aheight = 0;
var aoffset = 0;
var thePos = 0;
	if(aEle){
		aoffset = getOffset(aEle).top;
		DebugLog('GetDivTopByID - have element,offset is['+aoffset+']');
		aheight = aEle.clientHeight;
		DebugLog('GetDivTopByID - have element, height is['+aheight+']');
		if(aPercentOfHeight > 0){
			thePos = aoffset + (aheight * aPercentOfHeight);
		}else{
			if(aPercentOfHeight == 0){
				thePos = aoffset;
			}
		}
	}
	DebugLog('GetDivTopByID - return position is ['+thePos+']');
	return thePos;
}


//----------------------------------------------------------------------------
function GetDivTopByClass(aClassName,aPercentOfHeight){
var aEle = GetFirstDivByClass(aClassName);
var aheight = 0;
var aoffset = 0;
var thePos = 0;
	if(aEle){
		aoffset = getOffset(aEle).top;
		//DebugLog('GetDivTopByClass - have element,offset is['+aoffset+']');
		aheight = aEle.clientHeight;
		//DebugLog('GetDivTopByClass - have element, height is['+aheight+']');
		if(aPercentOfHeight > 0){
			thePos = aoffset + (aheight * aPercentOfHeight);
		}else{
			if(aPercentOfHeight == 0){
				thePos = aoffset;
			}
		}
	}
	//DebugLog('GetDivTopByClass - return position is ['+thePos+']');
	return thePos;
}

//----------------------------------------------------------------------------
function GetElementTopByClass(aTagName,aClassName,aPercentOfHeight){
var aEle = GetFirstElementByClass(aTagName,aClassName);
var aheight = 0;
var aoffset = 0;
var thePos = 0;
	if(aEle){
		aoffset = getOffset(aEle).top;
		//DebugLog('GetElementTopByClass - have element,offset is['+aoffset+']');
		aheight = aEle.clientHeight;
		//DebugLog('GetElementTopByClass - have element, height is['+aheight+']');
		if(aPercentOfHeight > 0){
			thePos = aoffset + (aheight * aPercentOfHeight);
		}else{
			if(aPercentOfHeight == 0){
				thePos = aoffset;
			}
		}
	}
	//DebugLog('GetElementTopByClass - return position is ['+thePos+']');
	return thePos;
}

//----------------------------------------------------------------------------
function GetFirstDivByClass(aClassName){
var divArr = document.getElementsByTagName("div");
var thecName;
var anElement;
var retval;
  if(divArr){
		var didOne = false;
    for(var i = 0; i < divArr.length; i++) {
			anElement = divArr[i];
			if(anElement){
				thecName = anElement.className;
				//DebugLog('GetFirstDivByClass - for['+anElement.id+'], class['+thecName+']');
				if(HasClassName(anElement,aClassName)){
					//DebugLog('GetFirstDivByClass - got div by class');
					retval = divArr[i];
					i = divArr.length;
				}
			}
    }
  }
	return retval;
}

//----------------------------------------------------------------------------
function GetElementTopByClass(aTagName,aClassName,aPercentOfHeight){
var aEle = GetFirstElementByClass(aTagName,aClassName);
var aheight = 0;
var aoffset = 0;
var thePos = 0;
	if(aEle){
		aoffset = getOffset(aEle).top;
		//DebugLog('GetFirstElementByClass - have element,offset is['+aoffset+']');
		aheight = aEle.clientHeight;
		//DebugLog('GetFirstElementByClass - have element, height is['+aheight+']');
		if(aPercentOfHeight > 0){
			thePos = aoffset + (aheight * aPercentOfHeight);
		}else{
			if(aPercentOfHeight == 0){
				thePos = aoffset;
			}
		}
	}
	//DebugLog('GetFirstElementByClass - return position is ['+thePos+']');
	return thePos;
}


//----------------------------------------------------------------------------
function GetFirstElementByClass(aTagName,aClassName){
var divArr = document.getElementsByTagName(aTagName);
var thecName;
var anElement;
var retval;
  if(divArr){
		var didOne = false;
    for(var i = 0; i < divArr.length; i++) {
			anElement = divArr[i];
			if(anElement){
				thecName = anElement.className;
				//DebugLog('GetFirstElementByClass - for['+anElement.id+'], class['+thecName+']');
				if(HasClassName(anElement,aClassName)){
					//DebugLog('GetFirstElementByClass - got div by class');
					retval = divArr[i];
					i = divArr.length;
				}
			}
    }
  }
	return retval;
}


//----------------------------------------------------------------------------
function AddClass(anID,classNameToAdd){
var adiv = document.getElementById(anID);	
AddClassForElement(adiv,classNameToAdd);
}

//----------------------------------------------------------------------------
function AddClassForElement(adiv,classNameToAdd){
var thecName;

  if(adiv){
    thecName = adiv.className;
		DebugLog('AddClassForElement - add class['+classNameToAdd+'], cur class['+thecName+']');
    if(!HasClassName(adiv,classNameToAdd)){
			DebugLog('AddClassForElement - doesnt already have class');
      if(thecName == ''){
				thecName = classNameToAdd;
			}else{
				thecName = thecName + ' ' + classNameToAdd;
			}
			
      adiv.className = thecName;
			DebugLog('AddClassForElement - final class['+thecName+']');
    }
  }
}

//----------------------------------------------------------------------------
function RemoveClass(anID,classNameToRemove){
var adiv = document.getElementById(anID);
RemoveClassForElement(adiv,classNameToRemove);
}

//----------------------------------------------------------------------------
function RemoveClassForElement(adiv,classNameToRemove){
var thecName;

  if(adiv){
    thecName = adiv.className;
		DebugLog('RemoveClassForElement - remove class['+classNameToRemove+'], cur class['+thecName+']');
    if(HasClassName(adiv,classNameToRemove)){
      if(adiv.className){
				ReplaceClassName(adiv,classNameToRemove,'');
        //alert('thecName after class['+ adiv.className +']');
      }
    }
  }
}


//----------------------------------------------------------------------------
function SwapClass(anID,oldClassName,newClassName){
var adiv = document.getElementById(anID);
var thecName;

  if(adiv){
    thecName = adiv.className;
		DebugLog('SwapClass - for['+anID+'], class['+thecName+']');
    if(HasClassName(adiv,oldClassName)){
			DebugLog('SwapClass - found class');
      if(adiv.className){
        DebugLog('SwapClass - thecName for['+anID+'] is ['+thecName+'], removing['+classNameToRemove+']');
				ReplaceClassName(adiv,oldClassName,newClassName);
        DebugLog('SwapClass - thecName after class['+ adiv.className +']');
      }
    }
  }
}

//----------------------------------------------------------------------------
function ToggleClass(anID,oldClassName,newClassName){
var adiv = document.getElementById(anID);
ToggleClassForElement(adiv,oldClassName,newClassName);
}

//----------------------------------------------------------------------------
function HasClassName(aElement,aClassName){
var retVal = false;
	if(aElement){
		var clName = aElement.className;
		if(clName){
			clName = clName + ' ';
			var testName = aClassName + ' ';
			if(clName.indexOf(testName) >= 0){
				retVal = true
			}
		}
	}
return retVal;
}

//----------------------------------------------------------------------------
function ReplaceClassName(aElement,oldClassName,newClassName){
var retVal = false;
	if(aElement){
		var clName = aElement.className;
		if(clName){
			clName = clName + ' ';
			var oldName = oldClassName + ' ';
			var newName = '';
			if(newClassName){
				newName = newClassName + ' ';
			}
			var newcName = clName.replace(oldName,newName);
			var lastchar = newcName.slice(-1);
			if(lastchar == ' '){
				newcName = newcName.slice(0,-1);
			}
			DebugLog('ReplaceClassName - new class['+newcName+']');
			aElement.className = newcName;
		}
	}
return retVal;
}

//----------------------------------------------------------------------------
function ToggleClassForElement(adiv,oldClassName,newClassName){
var thecName;

  if(adiv){
    thecName = adiv.className;
		DebugLog('ToggleClass - for['+adiv.id+'], class['+thecName+']');
    if(HasClassName(adiv,oldClassName)){
			DebugLog('ToggleClass - found old class');
      if(adiv.className){
				ReplaceClassName(adiv,oldClassName,newClassName);
        DebugLog('ToggleClass - thecName after class['+ adiv.className +']');
      }
    }else{
			if(HasClassName(adiv,newClassName)){
				DebugLog('ToggleClass - found new class');
				if(adiv.className){
					ReplaceClassName(adiv,newClassName,oldClassName);
					DebugLog('ToggleClass - thecName after class['+ adiv.className +']');
				}
    	}		
		}
  }
}

//----------------------------------------------------------------------------
function SwapClassForElement(anElement,oldClassName,newClassName){
var thecName;
var retval = false;

  if(anElement){
    thecName = anElement.className;
		//DebugLog('SwapClassForElement - for['+anElement.id+'], class['+thecName+']');
    if(thecName.indexOf(oldClassName) >= 0){
			//DebugLog('SwapClassForElement - found class');

        //DebugLog('SwapClassForElement - thecName for['+anElement.id+'] is ['+thecName+'], removing['+oldClassName+'], switch to['+newClassName+']');
        thecName = anElement.className.replace(oldClassName,newClassName);
        anElement.className = thecName;
        //DebugLog('SwapClassForElement - thecName after swap['+ anElement.className +']');
				retval = true;
    }
  }
return retval;
}

//----------------------------------------------------------------------------
function HideShowDivs(aDivNameList) {
//Prefix name with + for show, 
var theArr = aDivNameList.split(",");
var i;
var theID;
var firstChar;

  DebugLog('HideShowDivs - the div list ['+ aDivNameList +']');
  if(theArr) {
    for(i=0; i < theArr.length; i++){
      theID = theArr[i];
      if(theID.length > 0){
        firstChar = theID.charAt(0); //first char might be a + or a - or nothing special
        DebugLog('HideShowDivs - i['+i+'], val['+theID+'], firstchar['+firstChar+']');
        
        if(firstChar == '+'){
          theID = theID.substring(1);
          DebugLog('HideShowDivs - i['+i+'], showdiv['+theID+']');
          ShowDiv(theID);
        }else if(firstChar == '-'){
          theID = theID.substring(1);
          DebugLog('HideShowDivs - i['+i+'], hidediv['+theID+']');
          HideDiv(theID);
        }else{
          DebugLog('HideShowDivs - i['+i+'], togglediv['+theID+']');
          ToggleDiv(theID);
        }
      }
    }
    
  }else{
    DebugLog('HideShowDivs - the div list array was null.');
  }
}

//----------------------------------------------------------------------------
function ShowDiv(aDivName) {
var thebox = document.getElementById(aDivName);
DebugLog('ShowDiv - looking for div ['+ aDivName +']');
  if(thebox) {
			DebugLog('ShowDiv - the div ['+ aDivName +'] visibility['+thebox.style.visibility+']');
    //if ( thebox.style.visibility == 'hidden') {
      thebox.style.visibility = 'visible';
			DebugLog('ShowDiv - the div ['+ aDivName +'] was shown.');
    //}
  }else{
  DebugLog('ShowDiv - the div ['+ aDivName +'] was not found.');
  }
}

//----------------------------------------------------------------------------
function ShowDivForSeconds(aDivName,numSeconds) {
var thebox = document.getElementById(aDivName);

  if(thebox) {
    //if ( thebox.style.visibility == 'hidden') {
      thebox.style.visibility = 'visible';
      var msecs = numSeconds * 1000;
      setTimeout("HideDiv('"+aDivName+"');",msecs);
    //}
  }else{
  DebugLog('ShowDivForSeconds - the div ['+ aDivName +'] was not found.');
  }
}


//----------------------------------------------------------------------------
function HideDiv(aDivName) {
var thebox = document.getElementById(aDivName);

  if(thebox) {
    //if ( thebox.style.visibility == '') {
      thebox.style.visibility = 'hidden';
			DebugLog('HideDiv - the div ['+ aDivName +'] was hidden.');
    //}
  }else{
  DebugLog('HideDiv - the div ['+ aDivName +'] was not found.');
  }
}


//----------------------------------------------------------------------------
function HideParentDiv(aDivName) {
var thebox = document.getElementById(aDivName);
	DebugLog('HideParentDiv - the div name ['+aDivName+'].');
  if(thebox) {
		var theparent = thebox.parentNode;
		if(theparent){
			//if ( theparent.style.visibility == '') {
				theparent.style.visibility = 'hidden';
			//}
		}else{
			DebugLog('HideParentDiv - the parent div was not found.');
			
		}
  }else{
		DebugLog('HideParentDiv - the self div was not found.');
  }
}


//----------------------------------------------------------------------------
function checkValueThenHideDiv(aEditControl,aDivName) {
var thebox = document.getElementById(aDivName);
var theEdit = document.getElementById(aEditControl);
  if(thebox) {
		//DebugLog('checkValueThenHideDiv - div to hide['+aDivName+']');
    if(theEdit){
			//DebugLog('checkValueThenHideDiv - have input control['+aEditControl+']');
      if(theEdit.value != ''){
				//DebugLog('checkValueThenHideDiv - input has value, hide div - cur state['+thebox.style.visibility+']');
        if ( (thebox.style.visibility == '')||(thebox.style.visibility == 'visible') ) {
          thebox.style.visibility = 'hidden';
        }
      }
    }else{
			//DebugLog('checkValueThenHideDiv - no input control found, hide the div');
      if ( (thebox.style.visibility == '')||(thebox.style.visibility == 'visible') ) {
        thebox.style.visibility = 'hidden';
      }
    }
  }else{
  DebugLog('HideDiv - the div ['+ aDivName +'] was not found.');
  }
}

//----------------------------------------------------------------------------
function ToggleDiv(aDivName) {
var thebox = document.getElementById(aDivName);

  if(thebox) {
    if ( (thebox.style.visibility == '')||(thebox.style.visibility == 'visible') ) {
      thebox.style.visibility = 'hidden';
    }
    else {
      thebox.style.visibility = 'visible';
    }
  }else{
  DebugLog('ToggleDiv - the div ['+ aDivName +'] was not found.');
  }
}



//----------------------------------------------------------------------------
function FindParentDivAttributeValue(aDivRef,aAttribute,aMinValue){
	var retValue = -1;
	if(aDivRef){
		var aDivName = aDivRef.name;
		DebugLog('FindParentDivAttributeValue - the name ['+ aDivRef.name +'], id ['+ aDivRef.id +'], aAttribute['+ aAttribute +'], aMinValue['+ aMinValue +']');
		
		var theparent = thebox.parentNode;
		if(theparent){
			if(theparent.tagName == 'div'){
				var attribVal = theparent.getAttribute(aAttribute);
				if(attribVal){
					if(attribVal >= aMinValue){
						retValue = attribVal;
						return retValue;
					}else{
						DebugLog('FindParentDivAttributeValue - parent is div and attribute is set['+ attribVal +'], but not above threshold, go up one level.');
						retValue = FindParentDivAttributeValue(theparent,aAttribute,aMinValue);
						return retValue;					
					}
				}else{
					DebugLog('FindParentDivAttributeValue - parent is div, but attribute is not set, go up one level.');
					retValue = FindParentDivAttributeValue(theparent,aAttribute,aMinValue);
					return retValue;					
				}
			}else{
				DebugLog('FindParentDivAttributeValue - parent is not a div, go up one level.');
				retValue = FindParentDivAttributeValue(theparent,aAttribute,aMinValue);
				return retValue;
			}
		}else{
			DebugLog('FindParentDivAttributeValue - no parent node.');
			return -1;
		}
	}else{
		DebugLog('FindParentDivAttributeValue - invalid div ref.');
		return -1;
	}
}



//----------------------------------------------------------------------------
function getOffset( el ) {
    var _x = 0;
    var _y = 0;
    while( el && !isNaN( el.offsetLeft ) && !isNaN( el.offsetTop ) ) {
        _x += el.offsetLeft - el.scrollLeft;
        _y += el.offsetTop - el.scrollTop;
        el = el.offsetParent;
    }
    return { top: _y, left: _x };
}


//----------------------------------------------------------------------------
function getPageOffset( el ) {
    var _x = 0;
    var _y = 0;
    while( el && !isNaN( el.offsetLeft ) && !isNaN( el.offsetTop ) ) {
        _x += el.offsetLeft;
        _y += el.offsetTop;
        el = el.offsetParent;
    }
    return { top: _y, left: _x };
}

//----------------------------------------------------------------------------
function EnableItem(aItemID) {
var theitem = document.getElementById(aItemID);
  if(theitem){
    if( theitem.disabled == true){
      theitem.disabled = false;
    }
  }
}

//----------------------------------------------------------------------------
function DisableItem(aItemID) {
var theitem = document.getElementById(aItemID);
  DebugLog('DisableItem - '+aItemID+' - start');
  if(theitem){
    DebugLog('DisableItem - '+aItemID+', disabled: '+theitem.disabled);
    if( theitem.disabled == false){
      theitem.disabled = true;
    }
  }
}

//----------------------------------------------------------------------------
function MakeItemReadable(aItemID) {
var theitem = document.getElementById(aItemID);
  if(theitem){
    if( theitem.readonly == true){
      theitem.readonly = false;
    }
  }
}

//----------------------------------------------------------------------------
function MakeItemReadOnly(aItemID) {
var theitem = document.getElementById(aItemID);
  DebugLog('MakeItemReadOnly - '+aItemID+' - start');
  if(theitem){
    DebugLog('MakeItemReadOnly - '+aItemID+', readonly: '+theitem.readonly);
    if( theitem.readonly == false){
      theitem.readonly = true;
    }
  }
}




//----------------------------------------------------------------------------
function StartToggle(aImgName,aFile1,aFile2,aDelay) {
var theimg = document.getElementById(aImgName);

  //alert('here');
  if (theimg != null) {
    if ((aDelay > 0) && (theimg.togglestarted != 1)) {
      setTimeout("ToggleImage('"+aImgName+"','"+aFile1+"','"+aFile2+"',"+aDelay+");",aDelay);
    }
  }
}

//----------------------------------------------------------------------------
//DONT CALL THIS ONE DIRECTLY, CALL StartToggle ABOVE
function ToggleImage(aImgName,aFile1,aFile2,aDelay) {
var theimg = document.getElementById(aImgName);

  //alert('here');
  if (theimg != null) {
    if ( (theimg.toggleimage == null) || (theimg.toggleimage == 1) ) {
      theimg.src = aFile2;
      theimg.toggleimage = 0;
      theimg.togglestarted = 1;
    }
    else {
      theimg.src = aFile1;
      theimg.toggleimage = 1;
      theimg.togglestarted = 1;
    }
    if (aDelay > 0) {
      setTimeout("ToggleImage('"+aImgName+"','"+aFile1+"','"+aFile2+"',"+aDelay+");",aDelay);
	    return true;
	  }
	}
}

//----------------------------------------------------------------------------
function ScrollDivRight(aDivID) {
var thediv = document.getElementById(aDivID);

  if (thediv) {
    if (thediv.scrollLeftMax) {
      thediv.scrollLeft = thediv.scrollLeftMax;
    }else{
      thediv.scrollLeft = 100000;
    }
  }
}



//----------------------------------------------------------------------------
function getOffset( el ) {
    var _x = 0;
    var _y = 0;
    while( el && !isNaN( el.offsetLeft ) && !isNaN( el.offsetTop ) ) {
        _x += el.offsetLeft - el.scrollLeft;
        _y += el.offsetTop - el.scrollTop;
        el = el.offsetParent;
    }
    return { top: _y, left: _x };
}



//----------------------------------------------------------------------------
function changeBgImage (image, id) {
	var element = document.getElementById(id);
	element.style.backgroundImage = "url("+image+")";
}



//----------------------------------------------------------------------------
function changeBgColor (theColor, id) {
	var element = document.getElementById(id);
	element.style.backgroundColor = theColor;
}



//----------------------------------------------------------------------------
function copyToClipboardFromElement(aItemID,anAttribute) {
	var theitem = document.getElementById(aItemID);
	var theText =  '';
	if(theitem){
		if(anAttribute == 'innerHTML'){
			DebugLog('copyToClipboardFromElement - getting innerHTML');
			theText = theitem.innerHTML;
		}else{
			DebugLog('copyToClipboardFromElement - getting attribute['+anAttribute+']');
			theText = theitem.getAttribute(anAttribute);
		}
		theText = theText.replaceAll('&gt;','>');
		theText = theText.replaceAll('&lt;','<');
		theText = theText.replaceAll('&amp;','&');
		DebugLog('copyToClipboardFromElement - the item['+aItemID+'] attribute['+anAttribute+'], theText['+theText+']');
		copyToClipboard(theText);
	}else{
		DebugLog('copyToClipboardFromElement - the item['+aItemID+'] was not found.');
	}
}

//----------------------------------------------------------------------------
function copyControlToClipboard(theControlID) {
  var theControl = document.getElementById(theControlID);
	if(theControl){
		theControl.focus();
		theControl.select();
		try {
			var successful = document.execCommand('copy');
			var aMsg = successful ? 'successful' : 'unsuccessful';
			DebugLog('copyControlToClipboard - Copying text to clipboard result: ' + aMsg);
		} catch (err) {
			DebugLog('copyControlToClipboard - Failed to copy to clipboard');
		}
	}else{
		DebugLog('copyControlToClipboard - control ['+theControlID+'] not found');
	}
}

//----------------------------------------------------------------------------
function copyToClipboard(theText) {
  var textArea;
	DebugLog('copyToClipboard - START - theText['+theText+']');
	textArea = document.createElement('textArea');
  textArea.style.position = 'fixed';
  textArea.style.top = 0;
  textArea.style.left = 0;
  textArea.style.width = '2em';
  textArea.style.height = '2em';
  textArea.style.padding = 0;
  textArea.style.border = 'none';
  textArea.style.outline = 'none';
  textArea.style.boxShadow = 'none';
  textArea.style.background = 'transparent';
  textArea.value = theText;
  document.body.appendChild(textArea);	
	textArea.focus();
  textArea.select();

  try {
    var successful = document.execCommand('copy');
    var aMsg = successful ? 'successful' : 'unsuccessful';
    DebugLog('copyToClipboard - Copying text to clipboard result: ' + aMsg);
  } catch (err) {
    DebugLog('copyToClipboard - Failed to copy to clipboard');
  }
}


var clipboardHelper;
//----------------------------------------------------------------------------
function OLDcopyToClipboard (text) {
  if (window.clipboardData) // Internet Explorer
  {  
    window.clipboardData.setData("Text", text);
  }
  else
  {  
    unsafeWindow.netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");  
    clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"].getService(Components.interfaces.nsIClipboardHelper);  
    clipboardHelper.copyString(text);
  }
}

//----------------------------------------------------------------------------
function setFocus(theControlID) {
var theControl = document.getElementById(theControlID);
  if(theControl){
    theControl.focus();
		DebugLog('setFocus - set focus on control ['+theControlID+']');
  }else{
		DebugLog('setFocus - Control not found: ['+theControlID+']');
  }
}


//----------------------------------------------------------------------------
function insertTextIntoControl (theControlID,theText) {
var theControl = document.getElementById(theControlID);
var thePos;
  if(theControl){
    DebugLog('insertTextIntoControl - Control: '+theControlID);
    theControl.focus();
    insertAtCursor(theControl, theText);
  }else{
  DebugLog('insertTextIntoControl - Control not found: '+theControlID);
  }
}


//----------------------------------------------------------------------------
//http://jsfiddle.net/Znarkus/Z99mK/
function insertAtCursor(myField, myValue) {
    //IE support
    if (document.selection) {
        myField.focus();
        sel = document.selection.createRange();
        sel.text = myValue;
    }
    //MOZILLA and others
    else if (myField.selectionStart || myField.selectionStart == '0') {
        var startPos = myField.selectionStart;
        var endPos = myField.selectionEnd;
        myField.value = myField.value.substring(0, startPos)
            + myValue
            + myField.value.substring(endPos, myField.value.length);
        myField.selectionStart = startPos + myValue.length;
        myField.selectionEnd = startPos + myValue.length;
    } else {
        myField.value += myValue;
    }
}


//----------------------------------------------------------------------------
function selectTextInControl(theControlID) {
var theControl = document.getElementById(theControlID);
var thePos;
  if(theControl){
    DebugLog('selectTextInControl - Control['+theControlID+'], length['+theControl.value.length+']');
    theControl.focus();
    theControl.selectionStart = 0;
		theControl.selectionEnd = theControl.value.length;
  }else{
  DebugLog('selectTextInControl - Control not found: '+theControlID);
  }
}


//----------------------------------------------------------------------------
//http://stackoverflow.com/questions/263743/how-to-get-caret-position-in-textarea/2735606#2735606
function getCaret(el) { 
  if (el.selectionStart) { 
    return el.selectionStart; 
  } else if (document.selection) { 
    el.focus(); 

    var r = document.selection.createRange(); 
    if (r == null) { 
      return 0; 
    } 

    var re = el.createTextRange(), 
        rc = re.duplicate(); 
    re.moveToBookmark(r.getBookmark()); 
    rc.setEndPoint('EndToStart', re); 

    return rc.text.length; 
  }  
  return 0; 
}


//----------------------------------------------------------------------------
function stopBubbles(e) {

  e = e || window.event;
  if(e){
    e.cancelBubble = true;
    if (e.stopPropagation) e.stopPropagation();
  }
  return false;
}


//----------------------------------------------------------------------------
function getEventTarget(e) {
  e = e || window.event;
	var targ = e.target || e.srcElement;
  if (targ.nodeType == 3) targ = targ.parentNode; // defeat Safari bug
  return targ;
}

//----------------------------------------------------------------------------
function PrepCloseMenu(aClickName,aMenuName,aDelay) {
var theMenu = document.getElementById(aClickName);
	if(theMenu){
		if(theMenu.getAttribute('ADcloseTimerSet') == 'true'){
			theMenu.setAttribute('ADcloseTimerSet','false');
		}else{
			theMenu.setAttribute('ADcloseTimerSet','true');
			 setTimeout('DoCloseMenu("'+aClickName+'","'+aMenuName+'",'+aDelay+')',aDelay);
		}
	}

}

//----------------------------------------------------------------------------
function PrepCloseMenuEx(aClickName,aMenuName,aDelay,aCallbackFunc) {
var theMenu = document.getElementById(aClickName);
	if(theMenu){
		if(theMenu.getAttribute('ADcloseTimerSet') == 'true'){
			theMenu.setAttribute('ADcloseTimerSet','false');
		}else{
			theMenu.setAttribute('ADcloseTimerSet','true');
			setTimeout('DoCloseMenuEx("'+aClickName+'","'+aMenuName+'",'+aDelay+','+aCallbackFunc+')',aDelay);	
		}
	}
  
}

//----------------------------------------------------------------------------
function DoCloseMenu(aClickName,aMenuName,aDelay) {
	DoCloseMenuEx(aClickName,aMenuName,aDelay,null); 
}
//----------------------------------------------------------------------------
function DoCloseMenuEx(aClickName,aMenuName,aDelay,aCallbackFunc) {
	DebugLog('DoCloseMenuEx - START - click['+aClickName+'], menu['+aMenuName+']');

	if(isMouseInAbsElement(aClickName)){
		//DebugLog('DoCloseMenuEx - over click area');
		setTimeout('DoCloseMenuEx("'+aClickName+'","'+aMenuName+'",'+aDelay+','+aCallbackFunc+')',aDelay);	
		
	}else if(isMouseInAbsElement(aMenuName+'Child')){
		//DebugLog('DoCloseMenuEx - over menu area');
		setTimeout('DoCloseMenuEx("'+aClickName+'","'+aMenuName+'",'+aDelay+','+aCallbackFunc+')',aDelay);		
	
	}else if(isMouseInAbsElement(aMenuName+'Content')){
		//DebugLog('DoCloseMenuEx - over menu area');
		setTimeout('DoCloseMenuEx("'+aClickName+'","'+aMenuName+'",'+aDelay+','+aCallbackFunc+')',aDelay);		
		
	}else{
		//DebugLog('DoCloseMenuEx - checking for popup dialog next');
		var keepGoing = true;
		var thedlg = document.getElementById('PopUpDlg');
		if(thedlg){
			//DebugLog('DoCloseMenuEx - found popup dialog box on page');
			if(thedlg.style.display == 'none'){
				//DebugLog('DoCloseMenuEx - popup dialog is closed');
			}else{
				//DebugLog('DoCloseMenuEx - POPUP DIALOG IS STILL OPEN, KEEP WAITING');
				keepGoing = false;
				setTimeout('DoCloseMenuEx("'+aClickName+'","'+aMenuName+'",'+aDelay+','+aCallbackFunc+')',aDelay);	
			}
		}else{
			//DebugLog('DoCloseMenuEx - no popup dialog found!');
		}
		
		if(keepGoing){
			//DebugLog('DoCloseMenuEx - click['+aClickName+'], menu['+aMenuName+'] - closing now');
			var theMenu = document.getElementById(aClickName);
			if(theMenu){
				theMenu.setAttribute('ADcloseTimerSet','false');
			}		
			//DebugLog('DoCloseMenuEx - closing menu now');
			AnimateDivClose(aMenuName);
			if(aCallbackFunc){
				DebugLog('DoCloseMenuEx - click['+aClickName+'], menu['+aMenuName+'] - have callback, calling it now');
				aCallbackFunc();
			}
		}
	}
}



//----------------------------------------------------------------------------
function AnimateDivUpDown(aDivName,aWidth,closedHeight,openHeight) {
	DebugLog('AnimateDivUpDown - for ['+aDivName+']');
  return AnimateDivUpDownEx(aDivName,aWidth,closedHeight,openHeight,150);
}

//----------------------------------------------------------------------------
function AnimateDivOpen(aDivName) {
var thebox = document.getElementById(aDivName);
  if(thebox){
    DebugLog('AnimateDivOpen - box['+aDivName+']');
    thebox.setAttribute('ADopen','false'); //TELL THE BOX IT IS CLOSED SO THAT IT WILL OPEN
  }
  return AnimateDivUpDownEx(aDivName,-1,-1,-1,-1);
}

//----------------------------------------------------------------------------
function AnimateDivClose(aDivName) {
var thebox = document.getElementById(aDivName);

  if(thebox){
		DebugLog('AnimateDivClose - for ['+aDivName+']');
    thebox.setAttribute('ADopen','true'); //TELL THE BOX IT IS OPEN SO IT WILL CLOSE
  }
  return AnimateDivUpDownEx(aDivName,-1,-1,-1,-1);
}

//----------------------------------------------------------------------------
function AnimateDivSetOpen(aDivName,aWidth,closedHeight,openHeight,aniSpeed) {
var thebox = document.getElementById(aDivName);
  if(thebox){
    DebugLog('AnimateDivSetOpen - doing open for ['+aDivName+']');
    thebox.setAttribute('ADopen','false'); //TELL THE BOX IT IS CLOSED SO THAT IT WILL OPEN
  }
	SetAnimateDiv(aDivName,aWidth,closedHeight,openHeight,aniSpeed); 
  return AnimateDivUpDownEx(aDivName,aWidth,closedHeight,openHeight,aniSpeed);
}

//----------------------------------------------------------------------------
function AnimateDivSetClose(aDivName,aWidth,closedHeight,openHeight,aniSpeed) {
var thebox = document.getElementById(aDivName);

  if(thebox){
		DebugLog('AnimateDivSetClose - doing close for ['+aDivName+']');
    thebox.setAttribute('ADopen','true'); //TELL THE BOX IT IS OPEN SO THAT IT WILL CLOSE
  }
	SetAnimateDiv(aDivName,aWidth,closedHeight,openHeight,aniSpeed); 
  return AnimateDivUpDownEx(aDivName,aWidth,closedHeight,openHeight,aniSpeed);
}

//----------------------------------------------------------------------------
function PrepAnimateDiv(aDivName,aWidth,aClosedHeight,aOpenHeight,aAniSpeed) {
  PrepAnimateDivAux(0,aDivName,aWidth,aClosedHeight,aOpenHeight,aAniSpeed) 
}  

//----------------------------------------------------------------------------
function PrepAnimateDivAux(aCount,aDivName,aWidth,aClosedHeight,aOpenHeight,aAniSpeed) {
var thebox = document.getElementById(aDivName);

  if(thebox){
    DebugLog('PrepAnimateDivAux - found box ['+aDivName+']');
    SetAnimateDiv(aDivName,aWidth,aClosedHeight,aOpenHeight,aAniSpeed) 
    
  }else{
    newCount = aCount + 1;
    if(newCount > 100){
      DebugLog('PrepAnimateDivAux - failed after 100 attempts to find ['+aDivName+']');
    }else{
      setTimeout("PrepAnimateDivAux("+newCount+",'"+aDivName+"',"+aWidth+","+aClosedHeight+","+aOpenHeight+","+aAniSpeed+")",50);
    }
  }
}  

//----------------------------------------------------------------------------
function SetAnimateDiv(aDivName,aWidth,aClosedHeight,aOpenHeight,aAniSpeed) {
var thebox = document.getElementById(aDivName);

  if(thebox){
    DebugLog('SetAnimateDiv - found box ['+aDivName+']');
    thebox.setAttribute('ADwidth',aWidth);
    thebox.setAttribute('ADclosedHeight',aClosedHeight);
    thebox.setAttribute('ADopenHeight',aOpenHeight);
    thebox.setAttribute('ADaniSpeed',aAniSpeed);
    DebugLog('SetAnimateDiv - made box settings - width['+aWidth+'], closedHeight['+aClosedHeight+'], openHeight['+aOpenHeight+'], aniSpeed['+aAniSpeed+']');

   }
}  


//----------------------------------------------------------------------------
function SetAnimateDivSelectClass(aDivName,aSelectedClassName){
var thebox = document.getElementById(aDivName);

  if(thebox){
    DebugLog('SetAnimateDivSelectClass - found div ['+aDivName+'], setting class to add['+aSelectedClassName+']');
    thebox.setAttribute('ADselClass',aSelectedClassName);
   }else{
		 DebugLog('SetAnimateDivSelectClass - didnt find the div ['+aDivName+']');
	 }
	
}

var g_ADrecursion = false;

//----------------------------------------------------------------------------
function AnimateDivUpDownEx(aDivName,aWidth,aClosedHeight,aOpenHeight,aAniSpeed) {
var thebox = document.getElementById(aDivName);
var thechild = document.getElementById(aDivName+'Child');
var thehold = document.getElementById(aDivName+'hold');
var theWidth;
var theArrowName;
var theArrow;
var newsrc;
var newopenheight;
var newopenwidth;
var retVal;
var closedHeight;
var openHeight;
var aniSpeed;
var clickDivName = aDivName + 'Click';
var curTop = 0;
var curLeft = 0;
var calcChildHeight = 0;

  retVal = 0;
  if(thebox){
		curTop = parseInt(thebox.style.top);
		curLeft = parseInt(thebox.style.left);
		
     DebugLog('AnimateDivUpDownEx - START - found div ['+aDivName+'], anispeed['+aAniSpeed+']');
    if(aAniSpeed == -1){
			DebugLog('AnimateDivUpDownEx - anispeed set to -1 get values from the DIV settings');
      theWidth = thebox.getAttribute('ADwidth');
      closedHeight = thebox.getAttribute('ADclosedHeight');
      openHeight = thebox.getAttribute('ADopenHeight');
      aniSpeed = thebox.getAttribute('ADaniSpeed');
      DebugLog('AnimateDivUpDownEx - ['+aDivName+'] have DIV settings - width['+theWidth+'], closedHeight['+closedHeight+'], openHeight['+openHeight+'], aniSpeed['+aniSpeed+']');
      
    }else{
       DebugLog('AnimateDivUpDownEx - ['+aDivName+'] use parameters - width['+aWidth+'], closedHeight['+aClosedHeight+'], openHeight['+aOpenHeight+'], aniSpeed['+aAniSpeed+']');
      if(aWidth == -1){
				if(thebox.width){
					theWidth = thebox.width;
				}else{
					theWidth = 0;
				}
        
      }
      else{
        theWidth = aWidth;
      }
			//store the settings
			if(typeof theWidth !== 'undefined'){thebox.setAttribute('ADwidth',theWidth)}
			if(typeof aClosedHeight !== 'undefined'){thebox.setAttribute('ADclosedHeight',aClosedHeight)}
			if(typeof aOpenHeight !== 'undefined'){thebox.setAttribute('ADopenHeight',aOpenHeight)}
			if(typeof aAniSpeed !== 'undefined'){thebox.setAttribute('ADaniSpeed',aAniSpeed)}

      DebugLog('AnimateDivUpDownEx - ['+aDivName+'] updated DIV settings - width['+thebox.getAttribute('ADwidth')+'], closedHeight['+thebox.getAttribute('ADclosedHeight')+'], openHeight['+thebox.getAttribute('ADopenHeight')+'], aniSpeed['+thebox.getAttribute('ADaniSpeed')+']');
      
      closedHeight = aClosedHeight;
      openHeight = aOpenHeight;
      aniSpeed = aAniSpeed;
    }

    if(theWidth == 0){
			if(thehold){
				newopenwidth = thehold.clientWidth + 4;
				DebugLog('AnimateDivUpDownEx - auto width setting - theHold new width is ['+ newopenwidth +']');
			}else{
				if(thechild){
					if(thechild.clientWidth <= 4){
						if(thechild.getAttribute('ADcalcWidth')){
							newopenwidth = thechild.getAttribute('ADcalcWidth');
							DebugLog('AnimateDivUpDownEx - auto width setting - theChild (calc stored) new width is ['+ newopenwidth +']');
						}else{
							thebox.style.visibility = 'visible';
							thebox.style.opacity = 0.001;
							thebox.style.width = 'auto';
							thebox.style.height = 'auto';
							thebox.style.whiteSpace = 'pre';
							newopenwidth = thechild.clientWidth;
							calcChildHeight = thechild.clientHeight;
							DebugLog('AnimateDivUpDownEx - auto width setting - recalc theChild - new width is ['+ newopenwidth +']');
							//thebox.style.visibility = 'hidden';
							thebox.style.width = newopenwidth +'px';  //DEFAULT DIV TO WIDTH OF CHILD
							thebox.style.height = '0px';	
							thebox.style.opacity = 1;		
							thechild.setAttribute('ADcalcWidth',newopenwidth);					
							thechild.setAttribute('ADcalcHeight',calcChildHeight);
						}
					}else{
						newopenwidth = thechild.clientWidth + 4;
						DebugLog('AnimateDivUpDownEx - auto width setting - theChild new width is ['+ newopenwidth +']');
					}
				}else{
					newopenwidth = thebox.clientWidth + 4;
					DebugLog('AnimateDivUpDownEx - auto width setting - theBox new width is ['+ newopenwidth +']');
				}				
			}

    }else{
      //newopenwidth = thebox.width;
      newopenwidth = theWidth;
			DebugLog('AnimateDivUpDownEx - auto width setting - ELSE new width is ['+ newopenwidth +']');
    }      


    theArrowName = aDivName + 'Arrow';
    theArrow = document.getElementById(theArrowName);
		 DebugLog('AnimateDivUpDownEx - box status - open flag['+thebox.getAttribute('ADopen')+']');
     if(thebox.getAttribute('ADopen') == '' || thebox.getAttribute('ADopen') == null || thebox.getAttribute('ADopen') == 'false')
     {
        if(openHeight == 0){
					if(thehold){
						//newopenheight = thehold.clientHeight + 4;
						newopenheight = thehold.scrollHeight + 4;
						DebugLog('AnimateDivUpDownEx - auto height setting - theHold new height is ['+ newopenheight +']');
					}else{
						if(thechild){
							if(calcChildHeight){
								newopenheight = calcChildHeight;
								DebugLog('AnimateDivUpDownEx - auto height setting - calc theChild - new height is ['+ newopenheight +']');
							}else{
								if(thechild.getAttribute('ADcalcHeight')){
									newopenheight = thechild.getAttribute('ADcalcHeight');
									DebugLog('AnimateDivUpDownEx - auto height setting - theChild (calc stored) new height is ['+ newopenheight +']');
								
								}else{
									newopenheight = thechild.clientHeight + 4;
									DebugLog('AnimateDivUpDownEx - auto height setting - theChild new height is ['+ newopenheight +']');
								}
							}
						}else{
							newopenheight = thebox.clientHeight + 4;
							DebugLog('AnimateDivUpDownEx - auto height setting - theBox new height is ['+ newopenheight +']');
						}						
					}

        }else{
          newopenheight = openHeight;
					DebugLog('AnimateDivUpDownEx - auto height setting - ELSE new height is ['+ newopenheight +']');
        }
        DebugLog('AnimateDivUpDownEx - box is CLOSED, going to open - newopenwidth['+ newopenwidth +'], newopenheight['+ newopenheight +'], aniSpeed['+ aniSpeed +']'); 
        
				//LOOK FOR AN PROCESS OTHER DIVS OF THE SAME GROUP PREFIX__RESTOFNAMEHERE - BUT ONLY IF WE AREN'T ALREADY DOING THIS SECTION
        var dubUS = aDivName.indexOf('__');
				if((dubUS >= 0) && (g_ADrecursion == false)){
					DebugLog('AnimateDivUpDownEx - found double underscore in div name['+aDivName+'] at pos ['+ dubUS +']');
					var divprefix = aDivName.slice(0,dubUS + 2);
					 DebugLog('AnimateDivUpDownEx - div group prefix is['+divprefix+']');
					//document.querySelector('[id^="gatewayContainerstacks"]')
					//document.querySelectorAll('[id^="gatewayContainerstacks"]')
					var groupDivList = document.querySelectorAll('[id^="'+divprefix+'"]');
					if(groupDivList){
						DebugLog('Found matching divs');
						for(var i = 0;i < groupDivList.length; ++i){
							DebugLog('Here is one of the divs ['+ groupDivList[i].id +']');
							if(aDivName.valueOf() == groupDivList[i].id.valueOf()){
								DebugLog('this is the one we just clicked on - dont do anything');
							}else{
								var thecurdiv = document.getElementById(groupDivList[i].id);
								
								if(thecurdiv){
									var thedivname = thecurdiv.id;
									var childpos = thedivname.indexOf('Child',thedivname.length - 5);
									if(childpos >= 0){
										DebugLog('this is a child div we want to look at');
										var theparentname = thedivname.slice(0,thedivname.length - 5);
										DebugLog('this is the parent of the child['+ theparentname +']');
										var theparent = document.getElementById(theparentname);
										if(theparent){
											if(theparent.getAttribute('ADopen') == 'true'){
												DebugLog('the div['+ thedivname +'] is open, so CLOSE IT NOW');
												g_ADrecursion = true;
												AnimateDivUpDownEx(theparentname,0,0,0,aAniSpeed);
												g_ADrecursion = false;
												DebugLog('the div['+ thedivname +'] finshed doing the close.');
											}
										}
									}
								}
							}
						}
					}else{
						DebugLog('Didnt find any matching divs');
					}
				}
				 
				
				if(openHeight != 0){
					DebugLog('AnimateDivUpDownEx - openHeight is set, add overflow auto as callback');
					animate(aDivName, curLeft, curTop, newopenwidth, newopenheight, aniSpeed, PostOpenAddAuto);
					//thebox.style.overflowY = 'auto';
				}else{
					DebugLog('AnimateDivUpDownEx - animate call - newWidth['+ newopenwidth +'], newHeight['+ newopenheight +'], speed['+ aniSpeed +']');
					animate(aDivName, curLeft, curTop, newopenwidth, newopenheight, aniSpeed, PostOpenAddAuto);
				}
				thebox.setAttribute('ADopen','true');
				
				
				var cntDivName = aDivName + 'Content';
				var cntDiv = document.getElementById(cntDivName);
				if(cntDiv){
					//DebugLog('found Content div inside Dyn div named ['+ cntDivName +'] and we are opening'); 
					if(cntDiv.style.overflowY != 'auto'){
						cntDiv.style.overflowY = 'auto';
					}
				}
				
				
				//CHECK FOR AND ADD THE SELECTED CLASS IF ONE IS SET FOR THIS DIV
				if(thebox.getAttribute('ADselClass')){
					DebugLog('we need to apply the selected class['+ thebox.getAttribute('ADselClass') +'] to the div');
					AddClass(clickDivName,thebox.getAttribute('ADselClass'));
				}
				
        //headerElement.innerHTML = 'vvv';
        //thebox.innerHTML = 'opened - width: '+theWidth+', height: '+openHeight
        if(theArrow != null){
          DebugLog('arrow src = '+theArrow.src);
          if(theArrow.src.indexOf('down-arrow') > -1){
            theArrow.src = theArrow.src.replace('down-arrow','up-arrow');
          }else{
            theArrow.src = theArrow.src.replace('down','up');
          }
        }
        retVal = 1;
     }
     else
     {

        DebugLog('AnimateDivUpDownEx - box is OPEN, going to close it - newopenwidth['+newopenwidth+'], closedHeight['+closedHeight+'], aniSpeed['+aniSpeed+']'); 

				if(openHeight != 0){
					 DebugLog('AnimateDivUpDownEx - openHeight is set, remove overflow auto');
					thebox.style.overflowY = 'hidden';
				}
				
        animate(aDivName, curLeft, curTop, newopenwidth, closedHeight, aniSpeed, null);
        thebox.setAttribute('ADopen','false');

				
				var cntDivName = aDivName + 'Content';
				var cntDiv = document.getElementById(cntDivName);
				if(cntDiv){
					//DebugLog('found Content div inside Dyn div named ['+ cntDivName +'] and we are closing'); 
					if(cntDiv.style.overflowY == 'auto'){
						cntDiv.style.overflowY = 'hidden';
					}
				}
				
				
				//CHECK FOR AND REMOVE THE SELECTED CLASS IF ONE IS SET FOR THIS DIV
				if(thebox.getAttribute('ADselClass')){
					 DebugLog('we need to remove the selected class['+ thebox.getAttribute('ADselClass') +'] for the div');
					RemoveClass(clickDivName,thebox.getAttribute('ADselClass'));
				}
				
        if(theArrow != null){
          //alert('arrow src = '+theArrow.src);
          if(theArrow.src.indexOf('down-arrow') > -1){
            theArrow.src = theArrow.src.replace('up-arrow','down-arrow');
          }else{
            theArrow.src = theArrow.src.replace('up','down');
          }
        }
        //headerElement.innerHTML = '^^^';
        //thebox.innerHTML = 'closed - width: '+theWidth+', height: '+closedHeight
        retVal = 2;
     }
   }else{
     DebugLog('AnimateDivUpDownEx - the box['+aDivName+'] was not found.');
   }
	 
	 DebugLog('AnimateDivUpDownEx - END');
   return retVal;
}

//----------------------------------------------------------------------------
function PostOpenAddAuto(aElementID){
	DebugLog('PostOpenAddAuto - for element['+aElementID+']');
	var thebox = document.getElementById(aElementID);
	if(thebox){
		var firstChild = thebox.getElementsByTagName('div')[0];
		if(firstChild){
			if(firstChild.style.overflowY == 'auto'){
				//WE DON'T NEED TO APPLY IT IF IT IS ALREADY IN THE CHILD DIV
			}else{
				//2018-11-9 MSH - removed this condition based on wrk289452577, but might have side effects
				//if(thebox.adopenheight && theboxadopenheight > 0){
					//thebox.style.overflowY = 'auto';
					//DebugLog('PostOpenAddAuto - adding (first child no auto) overflowY = auto');
				//}else{
					//THIS DOESN'T LOOOK LIKE A BOX WE HAVE TO ADJUST
				//}
			}
		}else{
			thebox.style.overflowY = 'auto';
			DebugLog('PostOpenAddAuto - adding (no first child) overflowY = auto');
		}
		
		
	}
}


//----------------------------------------------------------------------------
function AnimateDiv(aDivName,closedWidth,openWidth,closedHeight,openHeight) {
  return AnimateDivEx(aDivName,closedWidth,openWidth,closedHeight,openHeight,150);
}

//----------------------------------------------------------------------------
function AnimateDivEx(aDivName,closedWidth,openWidth,closedHeight,openHeight,aniSpeed) {
var thebox = document.getElementById(aDivName);
var thechild = document.getElementById(aDivName+'Child');
var theWidth;
var theArrowName;
var theArrow;
var newsrc;
var newopenheight;
var newopenwidth;
var retVal;
var curLeft = 0;
var curTop = 0;

  retVal = 0;

	if(thebox){
		curTop = parseInt(thebox.style.top);
		curLeft = parseInt(thebox.style.left);
	}

  theArrowName = aDivName + 'Arrow';
  theArrow = document.getElementById(theArrowName);

   if(thebox.getAttribute('ADopen') == '' || thebox.getAttribute('ADopen') == null || thebox.getAttribute('ADopen') == 'false')
   {
      if(openHeight == 0){
        if(thechild){
          newopenheight = thechild.clientHeight + 4;
        }else{
          newopenheight = thebox.clientHeight + 4;
        }
      }else{
        newopenheight = openHeight;
      }
      
      if(openWidth == 0){
        if(thechild){
          newopenwidth = thechild.clientWidth + 4;
        }else{
          newopenwidth = thebox.clientWidth + 4;
        }
      }else{
        newopenwidth = openWidth;
      }
      
      
      animate(aDivName, curLeft, curTop, newopenwidth, newopenheight, aniSpeed, null);
      thebox.setAttribute('ADopen','true');

      //headerElement.innerHTML = 'vvv';
      //thebox.innerHTML = 'opened - width: '+theWidth+', height: '+openHeight
      if(theArrow != null){
        //DebugLog('arrow src = '+theArrow.src);
        if(theArrow.src){
          if(theArrow.src.indexOf('down-arrow') > -1){
            theArrow.src = theArrow.src.replace('down-arrow','up-arrow');
          }else{
            theArrow.src = theArrow.src.replace('down','up');
          }
        }
      }
      retVal = 1;
   }
   else
   {

      animate(aDivName, curLeft, curTop, closedWidth, closedHeight, aniSpeed, null);
      thebox.setAttribute('ADopen','false');

      if(theArrow != null){
        //alert('arrow src = '+theArrow.src);
        if(theArrow.src){
          if(theArrow.src.indexOf('down-arrow') > -1){
            theArrow.src = theArrow.src.replace('up-arrow','down-arrow');
          }else{
            theArrow.src = theArrow.src.replace('up','down');
          }
        }
      }
      //headerElement.innerHTML = '^^^';
      //thebox.innerHTML = 'closed - width: '+theWidth+', height: '+closedHeight
      retVal = 2;
   }
   return retVal;
}

//----------------------------------------------------------------------------
function IsAnimateDivOpen(aDivName){
var thebox = document.getElementById(aDivName);

  if(thebox.getAttribute('ADopen') == '' || thebox.getAttribute('ADopen') == null || thebox.getAttribute('ADopen') == 'false') {
    return false;
  }
  else {
    return true;
  }
  
}


//----------------------------------------------------------------------------
function animate(elementID, newLeft, newTop, newWidth, newHeight, time, callback)
{
	DebugLog('animate - start - newLeft['+newLeft+'], newTop['+newTop+'], newWidth['+newWidth+'], newHeight['+newHeight+']');
  var el = document.getElementById(elementID);
  if(el == null)
    return;
 
  var cLeft = parseInt(el.style.left);
  var cTop = parseInt(el.style.top);
  var cWidth = parseInt(el.style.width);
	if(isNaN(cWidth)){
		DebugLog('animate - setting to zero');
		cWidth = 0;
	}
	
  var cHeight = parseInt(el.style.height);
 
  var totalFrames = 1;
  if(time > 2000){
		totalFrames = time/50;
	}else if(time > 1000){
		totalFrames = time/50;
	}else if(time > 500){
		totalFrames = time/50;
	}else if(time > 200){
		totalFrames = time/50;
	}else if(time > 0){
		totalFrames = time/50;
	}
    	
  el.aniFrameTotal = totalFrames; //SAVE THE TOTAL FRAME COUNT IN THE DIV OBJ
  el.aniFrameCount = 0; //ALSO KEEP TRACK OF THE FRAMES RENDERED IN THE DIV OBJ TOO

  var fLeft = newLeft - cLeft;
  if(fLeft != 0)
    fLeft /= totalFrames;
 
  var fTop = newTop - cTop;
  if(fTop != 0)
    fTop /= totalFrames;
 
	DebugLog('animate - before fWidth calc - newwidth['+newWidth+'], cWidth['+cWidth+']'); 
  var fWidth = newWidth - cWidth;
	DebugLog('animate - after fWidth calc - fWidth['+fWidth+']');
  if(fWidth != 0)
    fWidth /= totalFrames;
	DebugLog('animate - after fWidth frames calc - fWidth['+fWidth+']');
	
  var fHeight = newHeight - cHeight;
  if(fHeight != 0)
    fHeight /= totalFrames;
   
	DebugLog('animate - before doFrame - left['+fLeft+'], top['+fTop+'], width['+fWidth+'], height['+fHeight+']');
  doFrame(elementID, cLeft, newLeft, fLeft,
      cTop, newTop, fTop, cWidth, newWidth, fWidth,
      cHeight, newHeight, fHeight, callback);
}

//----------------------------------------------------------------------------
function doFrame(eID, cLeft, nLeft, fLeft,
      cTop, nTop, fTop, cWidth, nWidth, fWidth,
      cHeight, nHeight, fHeight, callback)
{
   var el = document.getElementById(eID);
   if(el == null)
     return;

  el.aniFrameCount = el.aniFrameCount + 1;

  cLeft = moveSingleVal(cLeft, nLeft, fLeft);
  cTop = moveSingleVal(cTop, nTop, fTop);
  cWidth = moveSingleVal(cWidth, nWidth, fWidth);
  cHeight = moveSingleVal(cHeight, nHeight, fHeight);

	DebugLog('doFrame - cur width['+el.style.width+'], new width['+ Math.round(cWidth) + 'px' +']');
  el.style.left = Math.round(cLeft) + 'px';
  el.style.top = Math.round(cTop) + 'px';
  el.style.width = Math.round(cWidth) + 'px';
  el.style.height = Math.round(cHeight) + 'px';
 
  if(cLeft == nLeft && cTop == nTop && cHeight == nHeight
    && cWidth == nWidth)
  {
    el.aniFrameCount = 0;
    if(callback != null)
      callback(eID); 
    return; //WE ARE DONE, SO BAIL OUT NOW
  }
  else{ 
    //CHECK FOR THE FRAME COUNT LIMITATION
    if(  el.aniFrameCount > (el.aniFrameTotal + 1)){
      //alert('max: '+el.aniFrameTotal+', count: '+el.aniFrameCount);
      el.aniFrameCount = 0;
      if(callback != null)
        callback(eID);
      return;
    }
    else{
      //WE NEED TO KEEP RENDERING FRAMES, GET READY TO DO THE NEXT FRAME
      setTimeout( 'doFrame("'+eID+'",'+cLeft+','+nLeft+','+fLeft+','
        +cTop+','+nTop+','+fTop+','+cWidth+','+nWidth+','+fWidth+','
        +cHeight+','+nHeight+','+fHeight+','+callback+')', 50);
    }
  }
}

//----------------------------------------------------------------------------
function moveSingleVal(currentVal, finalVal, frameAmt)
{
  if(frameAmt == 0 || currentVal == finalVal)
    return finalVal;
 
  currentVal += frameAmt;
  if((frameAmt> 0 && currentVal>= finalVal)
    || (frameAmt <0 && currentVal <= finalVal))
  {
    return finalVal;
  }
  return currentVal;
}


//----------------------------------------------------------------------------
function GetOpacity(aElement){
var theOp = null;

  if(aElement){
    if(aElement.style.opacity){
      theOp = aElement.style.opacity;
    }else{
      if(aElement.style.filter){
        theOp = aElement.style.filter; //alpha(opacity=90)
      }else{
        theOp = 1.0;
      }
    }
  }
return theOp;
} 


//----------------------------------------------------------------------------
function SetOpacity(aElement,anOpacity){
  if(aElement){
    if(aElement.style.opacity){
      if(anOpacity <= 0){
        DebugLog('SetOpacity - given['+anOpacity+'], force to zero');
        aElement.style.opacity = 0.0;
        //setTimeout("SetZeroOpacityAgain('"+ aElement.id +"')",2000);
      }else if(anOpacity >= 1){
        DebugLog('SetOpacity - given['+anOpacity+'], force to 1.0');
        aElement.style.opacity = 1.0;      
      }else{
        DebugLog('SetOpacity - given['+anOpacity+'] set as given');
        aElement.style.opacity = anOpacity;
      }
    }else{
      if(aElement.style.filter){
        if(anOpacity <= 0){
          aElement.style.filter = 'alpha(opacity=0)'; //alpha(opacity=90)
        }else if(anOpacity >= 1){
          aElement.style.filter = 'alpha(opacity=100)'; //alpha(opacity=90)
        }else{
          aElement.style.filter = 'alpha(opacity='+ (anOpacity*100) +')'; //alpha(opacity=90)
        }
      }else{
        aElement.style.opacity = anOpacity;
      }
    }
  }
}


//----------------------------------------------------------------------------
function SetZeroOpacityAgain(aElementID){
var aElement = document.getElementById(aElementID);
  DebugLog('SetZeroOpacityAgain - divName['+aElementID+']');
  if(aElement){
    if(aElement.style.opacity){
      DebugLog('SetZeroOpacityAgain - setting it to zero in a callback');
      aElement.style.opacity = -1.0;
    }
  }
}



//----------------------------------------------------------------------------
function SetSweep(aElement,aDirection,aDecSweep,aTargetSize){
var newVal = 0;

  if(aElement){
    switch(aDirection){
      case 1: //LEFT TO RIGHT
        newVal = Math.round( aTargetSize * (1-aDecSweep) );
        if(newVal < 0) newVal = 0;
        
        DebugLog('SetSweep(L 2 R): cur width = '+aElement.clientWidth+', scale to pct['+aDecSweep+']');
        DebugLog('SetSweep(L 2 R): new width = '+newVal);
        aElement.style.width = newVal+'px';
        break;
        
      case 2: //RIGHT TO LEFT
        newVal =Math.round( aTargetSize * aDecSweep );
        if(newVal < 0) newVal = 0;
        
        DebugLog('SetSweep(R 2 L): cur width = '+aElement.clientWidth+', scale to pct['+aDecSweep+']');
        DebugLog('SetSweep(R 2 L): new width = '+newVal);
        aElement.style.width = newVal+'px';
        break;

      case 3: //TOP TO BOTTOM
        newVal =Math.round( aTargetSize * aDecSweep );
        if(newVal < 0) newVal = 0;
        
        DebugLog('SetSweep(T 2 B): cur height = '+aElement.clientHeight+', scale to pct['+aDecSweep+']');
        DebugLog('SetSweep(T 2 B): new height = '+newVal);
        aElement.style.height = newVal+'px';
        break;

    
    }
  }
}

//----------------------------------------------------------------------------
function HoverDivLoad(aDivName) {
var thebox = document.getElementById(aDivName);
var theOp = null;

  DebugLog('HoverDivLoad - START - div['+aDivName+']');
  if(thebox){
    //theOp = GetOpacity(thebox);
    //DebugLog('HoverDivLoad - thebox opacity = '+theOp);

    var parentdiv = thebox.parentNode;
    if(parentdiv){
      //DebugLog('parentdiv - id['+parentdiv.id+']');
      //DebugLog('parentdiv - background color['+parentdiv.style.backgroundColor+']');
      if(thebox.style.backgroundImage == ''){
        //DebugLog('thebox - no background image');
        if(thebox.style.backgroundColor == ''){
          //DebugLog('thebox - no background color, set to parent backgroundColor');
          thebox.style.backgroundColor = parentdiv.style.backgroundColor;
        }
      }
    }
  }
}


//----------------------------------------------------------------------------
function HoverDivFade(aDivName,orgWidth,orgHeight,fadeTime,aniMode) {
var thebox = document.getElementById(aDivName);
var theOp = null;
  //DebugLog('HOVERDIV');
  DebugLog('HoverDivFade - START - div['+aDivName+']');
  
  theOp = GetOpacity(thebox);
  //DebugLog('HoverDivFade - thebox opacity = '+theOp);
  //element.style.filter = 'alpha(opacity=90)'; // USE IE FALLBACK
  /*
  var parentdiv = thebox.parentNode;
  if(parentdiv){
    DebugLog('parentdiv - id['+parentdiv.id+']');
    DebugLog('parentdiv - background color['+parentdiv.style.backgroundColor+']');
    if(thebox.style.backgroundImage == ''){
      DebugLog('thebox - no background image');
      if(thebox.style.backgroundColor == ''){
        DebugLog('thebox - no background color, set to parent backgroundColor');
        thebox.style.backgroundColor = parentdiv.style.backgroundColor;
      }
    }
  }
  */
  
  thebox.fadeAniMode = aniMode;
  thebox.orgClientWidth = orgWidth;
  thebox.orgClientHeight = orgHeight;
  DebugLog('HoverDivFade - orgWidth ['+orgWidth+'], orgHeight ['+orgHeight+']');
  
  if(thebox.fadecomplete){
    DebugLog('HoverDivFade - already faded, skip restart');
    thebox.FadeReleaseTimer = setTimeout( 'doReleaseFade("'+aDivName+'",'+fadeTime+')', 200);
  }else{
    DebugLog('HoverDivFade - go ahead');
    if((thebox.fadestart == null) || (thebox.fadestart == false) || (thebox.faderelease == true) ){
      thebox.faderelease = false;
      //DebugLog('HoverDivFade - start fade - fadeBG: '+fadeBGcolor+' fadeBorder: '+fadeBorderColor);
      KillThenAnimateDivFade(aDivName,fadeTime);
    }else{
      //DebugLog('HoverDivFade - fadestart is: '+thebox.fadestart+', faderelease is: '+thebox.faderelease);
    }
    
    if(thebox.FadeReleaseTimer){
      //DebugLog('HoverDivFade - clearTimeout');
      clearTimeout(thebox.FadeReleaseTimer);
    }

    if(theOp == 0){
      //DO SOMETHING HERE
    }
    thebox.FadeReleaseTimer = setTimeout( 'doReleaseFade("'+aDivName+'",'+fadeTime+')', 200);
  }
}


//----------------------------------------------------------------------------
function HoverDivColorFade(aDivName,fadeBGcolor,fadeBorderColor,fadeTime) {
var thebox = document.getElementById(aDivName);
var orgBGcolor = getResolvedColor(thebox.style.backgroundColor);
//DebugLog('getstyle = '+getStyle(thebox,'borderColor'));
//var orgBorderColor = getResolvedColor(getStyle(thebox,'borderColor'));
var orgBorderColor = getResolvedColor(thebox.style.borderColor);
  fadeBGcolor = getResolvedColor(fadeBGcolor);
  fadeBorderColor = getResolvedColor(fadeBorderColor);
  //DebugLog('HOVERDIV');
  
  DebugLog('style.opacity = '+thebox.style.opacity);
  //element.style.filter = 'alpha(opacity=90)'; // USE IE FALLBACK
  
  
  if((thebox.fadestart == null) || (thebox.fadestart == false) || (thebox.faderelease == true) ){
    if(thebox.orgBGcolor){
      orgBGcolor = getResolvedColor(thebox.orgBGcolor);
      orgBorderColor = getResolvedColor(thebox.orgBorderColor);
    }else{
      DebugLog('setting the original background colors for this div - bg['+orgBGcolor+'], border['+orgBorderColor+']');
      thebox.orgBGcolor = orgBGcolor;
      thebox.orgBorderColor = orgBorderColor;
    }
    thebox.faderelease = false;
    //DebugLog('HoverDivFade - start fade - fadeBG: '+fadeBGcolor+' fadeBorder: '+fadeBorderColor);
    KillThenAnimateDivFade(aDivName,fadeBGcolor,fadeBorderColor,fadeTime);
  }else{
    //DebugLog('HoverDivFade - fadestart is: '+thebox.fadestart+', faderelease is: '+thebox.faderelease);
  }
  
  if(thebox.FadeReleaseTimer){
    //DebugLog('HoverDivFade - clearTimeout');
    clearTimeout(thebox.FadeReleaseTimer);
  }

  if(thebox.orgBGcolor){
    orgBGcolor = getResolvedColor(thebox.orgBGcolor);
    orgBorderColor = getResolvedColor(thebox.orgBorderColor);
  }
  thebox.FadeReleaseTimer = setTimeout( 'doReleaseColorFade("'+aDivName+'","'+orgBGcolor+'","'+orgBorderColor+'",'+fadeTime+')', 100);
}

//----------------------------------------------------------------------------
function doReleaseFade(aDivName,fadeTime) {
var thebox = document.getElementById(aDivName);
var backDivName = aDivName + 'Bk';
var FinDivName = aDivName + 'In';
var BinDivName = aDivName + 'BkIn';
var BaseDivName = aDivName.substring(0, aDivName.length - 2)

  DebugLog('doReleaseFade - START - checking div name['+aDivName+']');
  if(isMouseInElement(BaseDivName)) DebugLog('in DIV ['+BaseDivName+']');
  if(isMouseInElement(aDivName)) DebugLog('in DIV ['+aDivName+']');
  if(isMouseInElement(backDivName)) DebugLog('in DIV ['+backDivName+']');
  if(isMouseInElement(FinDivName)) DebugLog('in DIV ['+FinDivName+']');
  if(isMouseInElement(BinDivName)) DebugLog('in DIV ['+BinDivName+']');
  
  if(isMouseInElement(BaseDivName) || isMouseInElement(aDivName) || isMouseInElement(backDivName) || isMouseInElement(FinDivName) || isMouseInElement(BinDivName)){
    DebugLog('doReleaseFade - is hovering');
    thebox.FadeReleaseTimer = setTimeout( 'doReleaseFade("'+aDivName+'",'+fadeTime+')', 200);

  }else{
    DebugLog('doReleaseFade - no longer hovering, reverse fade');
    if(thebox.FadeReleaseTimer){
      //DebugLog('doReleaseFade - clearTimeout');
      clearTimeout(thebox.FadeReleaseTimer);
    }
    //thebox.fadestart = false;
    //thebox.fadenew = false;
    thebox.faderelease = true;
    
    //WE ARE RELASING THE FADE SO ANIMATE BACK TO ORIGINAL COLORS
    KillThenAnimateDivFade(aDivName,fadeTime);
  }
  DebugLog('doReleastFade - FINISH');
}

//----------------------------------------------------------------------------
function doReleaseColorFade(aDivName,orgBGcolor,orgBorderColor,fadeTime) {
var thebox = document.getElementById(aDivName);
var theBGcolor = getResolvedColor(orgBGcolor);
var theBorderColor = getResolvedColor(orgBorderColor);

  //DebugLog('doReleaseFade - orgBG: '+theBGcolor+' orgBorder: '+theBorderColor);
  if(isMouseInElement(aDivName)){
    //DebugLog('doReleaseFade - is hovering');
    thebox.FadeReleaseTimer = setTimeout( 'doReleaseColorFade("'+aDivName+'","'+orgBGcolor+'","'+orgBorderColor+'",'+fadeTime+')', 100);

  }else{
    //DebugLog('doReleaseFade - no longer hovering, reverse fade');
    if(thebox.FadeReleaseTimer){
      //DebugLog('doReleaseFade - clearTimeout');
      clearTimeout(thebox.FadeReleaseTimer);
    }
    //thebox.fadestart = false;
    //thebox.fadenew = false;
    thebox.faderelease = true;
    
    //WE ARE RELASING THE FADE SO ANIMATE BACK TO ORIGINAL COLORS
    KillThenAnimateDivColorFade(aDivName,theBGcolor,theBorderColor,fadeTime);
  }
  
}


//----------------------------------------------------------------------------
function KillThenAnimateDivFade(aDivName,fadeTime) {
var thebox = document.getElementById(aDivName);

  if(thebox.fadestart){
    DebugLog('KillThenAnimateDivFade - a fade is running, mark the kill flag and check it');
    thebox.killFade = true;
    setTimeout( 'CheckThenAnimateDivFade("'+aDivName+'",'+fadeTime+')', 50);
  }else{
    DebugLog('KillThenAnimateDivFade - no fade running, start animation now');
    AnimateDivFade(aDivName,fadeTime);
  }
}

//----------------------------------------------------------------------------
function KillThenAnimateDivColorFade(aDivName,fadeBGcolor,fadeBorderColor,fadeTime) {
var thebox = document.getElementById(aDivName);

  if(thebox.fadestart){
    //DebugLog('KillThenAnimateDivFade - a fade is running, mark the kill flag and check it');
    thebox.killFade = true;
    setTimeout( 'CheckThenAnimateDivColorFade("'+aDivName+'","'+fadeBGcolor+'","'+fadeBorderColor+'",'+fadeTime+')', 50);
  }else{
    //DebugLog('KillThenAnimateDivFade - no fade running, start animation now');
    AnimateDivColorFade(aDivName,fadeBGcolor,fadeBorderColor,fadeTime);
  }
}

//----------------------------------------------------------------------------
function CheckThenAnimateDivFade(aDivName,fadeTime) {
var thebox = document.getElementById(aDivName);

  if(thebox.killFade == false){
    //DebugLog('CheckThenAnimateDivFade - start animation now');
    AnimateDivFade(aDivName,fadeTime);
  }else{
    //DebugLog('CheckThenAnimateDivFade - still waiting for kill to be set');
    setTimeout( 'CheckThenAnimateDivFade("'+aDivName+'",'+fadeTime+')', 50);
  }
}

//----------------------------------------------------------------------------
function CheckThenAnimateDivColorFade(aDivName,fadeBGcolor,fadeBorderColor,fadeTime) {
var thebox = document.getElementById(aDivName);

  if(thebox.killFade == false){
    //DebugLog('CheckThenAnimateDivFade - start animation now');
    AnimateDivColorFade(aDivName,fadeBGcolor,fadeBorderColor,fadeTime);
  }else{
    //DebugLog('CheckThenAnimateDivFade - still waiting for kill to be set');

    setTimeout( 'CheckThenAnimateDivColorFade("'+aDivName+'","'+fadeBGcolor+'","'+fadeBorderColor+'",'+fadeTime+')', 50);
  }
}

//----------------------------------------------------------------------------
function AnimateDivFade(aDivName,fadeTime) {
var thebox = document.getElementById(aDivName);
var theWidth;
var theArrowName;
var theArrow;
var newsrc;


  DebugLog('AnimateDivFade - START - time['+fadeTime+']');
  var useFadeTime = 250;
  if(fadeTime > 0)
    useFadeTime = fadeTime;

    thebox.fadenew = false;
    thebox.fadestart = true;
    thebox.fadecomplete = false;   
    
    if(thebox.killFade == null || thebox.killFade == false){
      DebugLog('killFade: not true');
      if(thebox.faderelease){
        animateFade(aDivName, useFadeTime, FinishFadeRelease);
      }else{
        animateFade(aDivName, useFadeTime, null);
      }
    }
}

//----------------------------------------------------------------------------
function AnimateDivColorFade(aDivName,fadeBGcolor,fadeBorderColor,fadeTime) {
var thebox = document.getElementById(aDivName);
var theWidth;
var theArrowName;
var theArrow;
var newsrc;
var orgBGColor; 
var orgBorderColor;
var colortest;

  //NOTE: REQUIRES FULL HEX COLOR #FF00FF, CAN'T TAKE #F0F SHORTHAND
  fadeBGcolor = getResolvedColor(fadeBGcolor);
  fadeBorderColor = getResolvedColor(fadeBorderColor);

  orgBGcolor = getResolvedColor(thebox.style.backgroundColor);
  orgBorderColor = getResolvedColor(thebox.style.borderColor);

  //DebugLog('AnimateDivFade - BG: '+orgBGcolor+' to: '+fadeBGcolor+',  Border: '+orgBorderColor+' to: '+fadeBorderColor);
  var useFadeTime = 250;
  if(fadeTime > 0)
    useFadeTime = fadeTime;

    thebox.fadenew = false;
    thebox.fadestart = true;
    if(thebox.killFade == null || thebox.killFade == false){
      //DebugLog('fadenew: '+fadenew+', fadestart: '+fadestart+', faderelease: '+faderelease+', killFade: not true');
      if(thebox.faderelease){
        animateColorFade(aDivName, orgBGcolor, fadeBGcolor, orgBorderColor, fadeBorderColor, useFadeTime, FinishFadeRelease);
      }else{
        animateColorFade(aDivName, orgBGcolor, fadeBGcolor, orgBorderColor, fadeBorderColor, useFadeTime, null);
      }
    }
}

//----------------------------------------------------------------------------
function FinishFadeRelease(aDivName){
var thebox = document.getElementById(aDivName);
//DebugLog('FinishFadeRelease');
  thebox.faderelease = false;
  thebox.fadestart = false;
}

//----------------------------------------------------------------------------
function IsDivFaded(aDivName){
var thebox = document.getElementById(aDivName);

  if((thebox.fadenew == null) || (thebox.fadenew == false))
  {
    return false;
  }
  else {
    return true;
  } 
}

//----------------------------------------------------------------------------
function animateFade(elementID, time, callback)
{
  var el = document.getElementById(elementID);
  if(el == null)
    return;
  el.killFade = false;

  var totalFrames = 1;
  if(time > 0)
    totalFrames = time/50;

  el.aniFrameTotal = totalFrames; //SAVE THE TOTAL FRAME COUNT IN THE DIV OBJ
  el.aniFrameCount = 0; //ALSO KEEP TRACK OF THE FRAMES RENDERED IN THE DIV OBJ TOO
  
  doFadeFrame(elementID, callback);
}


//----------------------------------------------------------------------------
function animateColorFade(elementID, orgBGcolor, newBGcolor, orgBorderColor, newBorderColor, time, callback)
{
  var el = document.getElementById(elementID);
  if(el == null)
    return;
  el.killFade = false;
  //DebugLog('start animate: '+GetTicks());
  var oBG = orgBGcolor;
  var oBrd = orgBorderColor;
  var nBG = newBGcolor;
  var nBrd = newBorderColor;

  var totalFrames = 1;
  if(time > 0)
    totalFrames = time/20;

  el.aniFrameTotal = totalFrames; //SAVE THE TOTAL FRAME COUNT IN THE DIV OBJ
  el.aniFrameCount = 0; //ALSO KEEP TRACK OF THE FRAMES RENDERED IN THE DIV OBJ TOO

  var fBG = totalFrames;
  var fBrd = totalFrames;
   
  doFadeColorFrame(elementID, oBG, nBG, fBG, oBrd, nBrd, fBrd, callback);
}

//----------------------------------------------------------------------------
function doFadeFrame(eID, callback)
{
  var el = document.getElementById(eID);
  var theOp = null;
  var newVal = null;
  if(el == null)
    return;
  if(el.killFade){
    el.killFade = false;
    el.fadestart = false;
    el.fadenew = false
    el.fadecomplete = false;
    DebugLog('abort doFadeFrame due to killFade flag');
    return;
  }
  el.aniFrameCount = el.aniFrameCount + 1;
  DebugLog('doFadeFrame - framecount['+el.aniFrameCount+']');

  //theOp = GetOpacity(el); //CURRENT OPACITY
  //orgClientWidth
  //orgClientHeight
  
  if(el.faderelease){
    switch(el.fadeAniMode){
      case 1:
        DebugLog('doFadeFrame(release) - ['+el.aniFrameCount+']/['+el.aniFrameTotal+'] = ['+ el.aniFrameCount/el.aniFrameTotal +']');
        newVal = (el.aniFrameCount / el.aniFrameTotal);
        break;

      case 2:
        DebugLog('doFadeFrame(sweep1-release)');
        newVal = 1 - (el.aniFrameCount / el.aniFrameTotal);
        break;

      case 3:
        DebugLog('doFadeFrame(sweep2-release)');
        newVal = 1 - (el.aniFrameCount / el.aniFrameTotal);
        break;

      default:
        DebugLog('doFadeFrame(release) - ['+el.aniFrameCount+']/['+el.aniFrameTotal+'] = ['+ el.aniFrameCount/el.aniFrameTotal +']');
        newVal = (el.aniFrameCount / el.aniFrameTotal);
        break;
        
    }
  }else{
    switch(el.fadeAniMode){
      case 1:
        DebugLog('doFadeFrame(fade) - ['+el.aniFrameCount+']/['+el.aniFrameTotal+'] = ['+ el.aniFrameCount/el.aniFrameTotal +']');
        newVal = 1 - (el.aniFrameCount / el.aniFrameTotal);
        break;

      case 2:
        DebugLog('doFadeFrame(sweep L2R)');
        newVal = (el.aniFrameCount / el.aniFrameTotal);
        break;
        
      case 3:
        DebugLog('doFadeFrame(sweep T2B)');
        newVal = (el.aniFrameCount / el.aniFrameTotal);
        break;
        
      default:
        DebugLog('doFadeFrame(fade) - ['+el.aniFrameCount+']/['+el.aniFrameTotal+'] = ['+ el.aniFrameCount/el.aniFrameTotal +']');
        newVal = 1 - (el.aniFrameCount / el.aniFrameTotal);
        break;
    }
  }
  
  //NOW APPLY THE UPDATE
  switch(el.fadeAniMode){
    case 1:
      DebugLog('doFadeFrame - newOpacity['+newVal+']');
      SetOpacity(el,newVal);
      break;

    case 2:
      DebugLog('doFadeFrame - newSweep(L2R)['+newVal+'], orgWidth['+el.orgClientWidth+']');
      SetSweep(el,1,newVal,el.orgClientWidth); //DIRECTION 1 IS LEFT TO RIGHT
      break;

    case 3:
      DebugLog('doFadeFrame - newSweep(T2B)['+newVal+'], orgHeight['+el.orgClientHeight+']');
      SetSweep(el,3,newVal,el.orgClientHeight); //DIRECTION 3 IS TOP TO BOTTOM
      break;


    default:
      DebugLog('doFadeFrame - newOp['+newVal+']');
      SetOpacity(el,newVal);
      break;
    
  }
  
  DebugLog('doFadeFrame - newVal is ['+newVal+']');
  if(newVal <= 0)
  {
    el.aniFrameCount = 0;
    el.fadenew = true;  //DONE WITH THE FADE
    el.fadestart = false; //ANIMATION COMPLETE
    if(el.faderelease){
      el.fadecomplete = false;
    }else{
      el.fadecomplete = true;
    }
    DebugLog('Fade complete 1');
    if(callback != null)
      callback(eID); 
    //DebugLog('end animate 1: '+GetTicks());
    return; //WE ARE DONE, SO BAIL OUT NOW
  }
  else{ 
    DebugLog('doFadeFrame - check frame limiation count - count['+el.aniFrameCount+'], frame total['+el.aniFrameTotal+']');
    //CHECK FOR THE FRAME COUNT LIMITATION
    if(  el.aniFrameCount >= (el.aniFrameTotal)){
      DebugLog('doFadeFrame - frame limiation triggered');
      //alert('max: '+el.aniFrameTotal+', count: '+el.aniFrameCount);
      el.aniFrameCount = 0;
      el.fadenew = true;  //DONE WITH THE FADE
      el.fadestart = false; //ANIMATION COMPLETE
      if(el.faderelease){
        el.fadecomplete = false;
      }else{
        el.fadecomplete = true;
      }
      DebugLog('Fade complete 2');
      if(callback != null)
        callback(eID);
      return;
    }
    else{
      //WE NEED TO KEEP RENDERING FRAMES, GET READY TO DO THE NEXT FRAME
      setTimeout( 'doFadeFrame("'+eID+'",'+callback+')', 20);
    }
  }
}


//----------------------------------------------------------------------------
function doFadeColorFrame(eID, oBG, nBG, fBG, oBrd, nBrd, fBrd, callback)
{
  var el = document.getElementById(eID);
  if(el == null)
    return;
  if(el.killFade){
    el.killFade = false;
    el.fadestart = false;
    el.fadenew = false
    //DebugLog('abort doFadeFrame due to killFade flag');
    return;
  }
  el.aniFrameCount = el.aniFrameCount + 1;
  //DebugLog('doFadeFrame - oBG: '+oBG+' nBG: '+nBG+' fBG: '+fBG);
  //DebugLog('doFadeFrame - oBrd: '+oBrd+' nBrd: '+nBrd+' fBrd: '+fBrd);
  if(oBG != '')
    oBG = fadeColorVal(oBG, nBG, fBG);
  if(oBrd != '')
    oBrd = fadeColorVal(oBrd, nBrd, fBrd);

  el.style.backgroundColor = oBG;
  el.style.borderColor = oBrd;
 
  if(oBG == nBG && oBrd == nBrd)
  {
    el.aniFrameCount = 0;
    el.fadenew = true;  //DONE WITH THE FADE
    el.fadestart = false; //ANIMATION COMPLETE
    //DebugLog('Fade complete 1');
    if(callback != null)
      callback(eID); 
    //DebugLog('end animate 1: '+GetTicks());
    return; //WE ARE DONE, SO BAIL OUT NOW
  }
  else{ 
    //CHECK FOR THE FRAME COUNT LIMITATION
    if(  el.aniFrameCount > (el.aniFrameTotal + 1)){
      //alert('max: '+el.aniFrameTotal+', count: '+el.aniFrameCount);
      el.aniFrameCount = 0;
      el.fadenew = true;  //DONE WITH THE FADE
      el.fadestart = false; //ANIMATION COMPLETE
      //DebugLog('Fade complete 2');
      if(callback != null)
        callback(eID);
      return;
    }
    else{
      //REDUCE THE NUMBER OF FRAMES EACH TIME
      fBG = fBG - 1;
      if(fBG <= 0) 
        fBG = 0;
      fBrd = fBrd - 1;
      if(fBrd <= 0)
        fBrd = 0;
      //WE NEED TO KEEP RENDERING FRAMES, GET READY TO DO THE NEXT FRAME
      setTimeout( 'doFadeColorFrame("'+eID+'","'+oBG+'","'+nBG+'",'+fBG+',"'+oBrd+'","'+nBrd+'",'+fBrd+','+callback+')', 20);
    }
  }
}


//----------------------------------------------------------------------------
function fadeColorVal(currentVal, finalVal, incrementCnt)
{
  if(incrementCnt <= 0 || currentVal == finalVal)
    return finalVal;
    
  //GET THE CURRENT HEX COLOR IN TO RGB DEC VALUES  
  //DebugLog('fadeColorVal - currentVal: '+currentVal);
  var cValRGB = hex2rgb(currentVal)
  var rval = cValRGB.red;
  var gval = cValRGB.green;
  var bval = cValRGB.blue;

  //GET THE FINAL HEX COLOR IN TO RGB DEC VALUES  
  //DebugLog('fadeColorVal - finalVal: '+finalVal);
  var fValRGB = hex2rgb(finalVal)
  var frval = fValRGB.red;
  var fgval = fValRGB.green;
  var fbval = fValRGB.blue;

  //DebugLog('fadeColorVal - incrementCnt: '+incrementCnt);


  //INCREMENT FROM CURRENT TO FINAL BY ONE STEP OF THE INCREMENT CNT
  var newr = rval;
  if(rval != frval)
    newr = Math.round(rval + ((frval - rval) / incrementCnt));

  var newg = gval;
  if(gval != fgval)
    newg = Math.round(gval + ((fgval - gval) / incrementCnt));

  var newb = bval;
  if(bval != fbval)
    newb = Math.round(bval + ((fbval - bval) / incrementCnt));
 
  //NOW BUILD THE OUTPUT HEX COLOR
  var newVal = '#';
  //DebugLog('r val: '+newr+' hex: '+newr.toString(16));
  //DebugLog('g val: '+newg+' hex: '+newg.toString(16));
  //DebugLog('b val: '+newb+' hex: '+newb.toString(16));
  var tmpr = newr.toString(16);
  var tmpg = newg.toString(16);
  var tmpb = newb.toString(16);
  if(tmpr.length == 1)
    tmpr = '0' + tmpr;
  if(tmpg.length == 1)
    tmpg = '0' + tmpg;
  if(tmpb.length == 1)
    tmpb = '0' + tmpb;
  
  newVal = newVal + tmpr + tmpg + tmpb;

  //DebugLog('newval: '+newVal);
  return newVal;
}


//----------------------------------------------------------------------------
function hex2rgb(hex) {
// SAMPLE CALL
//var hex = "#fA0";
//var rgb = hex2rgb(hex);
//document.write("<pre>"+hex+" \u2192 rgb("+rgb.red+","+rgb.green+","+rgb.blue+")</pre>");
  
  //DebugLog('start hex['+hex+']');
  //DebugLog('start hex0['+hex.substr(0,1)+']');

  if (hex.substr(0,1)=='#'){ 
    hex = hex.substr(1);
    //DebugLog('hex#['+hex+']');
  }
  
  if (hex.length == 1) {
    hex = '00000'+hex;
  }else if (hex.length == 2) {
    hex = '0000'+hex;
  }else if (hex.length == 4) {
    hex = '00'+hex;
  }else if (hex.length == 5) {
    hex = '0'+hex;
  }else if (hex.length == 3) {
    var temp = hex; 
    hex = '';
    var tmpregex = new RegExp('^([a-f0-9])([a-f0-9])([a-f0-9])$','i');
    //temp = /^([a-f0-9])([a-f0-9])([a-f0-9])$/i.exec(temp);
    var temp = tmpregex.exec(temp);
    //DebugLog('temp str['+temp+']');
    temp = temp.slice(1);
    //DebugLog('temp slice['+temp+']');
    for (var i=0;i<3;i++) hex+=temp[i]+temp[i];
  }
  //DebugLog('hex str['+hex+']');
  var tregex = new RegExp('^([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$','i');
  //var triplets = /^([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i.exec(hex);
  var triplets = tregex.exec(hex);
  //DebugLog('triplets str['+triplets+']');
  triplets = triplets.slice(1);
  //DebugLog('triplets slice['+triplets+']');
  return {
    red: parseInt(triplets[0],16),
    green: parseInt(triplets[1],16),
    blue: parseInt(triplets[2],16)
  }
}


//----------------------------------------------------------------------------
function getResolvedColor(aColor){
var newcolor = aColor;
var colortest;
var hex;
  //DebugLog('getResolvedColor - start['+aColor+']');
  if(newcolor == ''){
    //DebugLog('is blank color str');
    newcolor = '#FFFFFF';
  }

  if (newcolor.substr(0,1) == '#'){
    //DebugLog('has leading #');
    hex = newcolor.substr(1);
    if (hex.length == 1) {
      hex = '00000'+hex;
    }else if (hex.length == 2) {
      hex = '0000'+hex;
    }else if (hex.length == 4) {
      hex = '00'+hex;
    }else if (hex.length == 5) {
      hex = '0'+hex;
    }
    newcolor = '#'+hex;
  }else{
    //DebugLog('does not have leading #');
  }

  colortest = colorNameToHex(newcolor);

  if(colortest != false && colortest != 'undefined' ){
    //DebugLog('assign to colortest value ['+colortest+']');
    newcolor = colortest;
  }else{
    //DebugLog('assign to newcolor value ['+newcolor+']');
    newcolor = colorToHex(newcolor);
  }
  
  //DebugLog('getResolvedColor - finish['+newcolor+']');

return newcolor;
}


//----------------------------------------------------------------------------
function colorToHex(aColor) {
  //DebugLog('colorToHex - color['+aColor+']');
  if (aColor.substr(0, 1) == '#') {
      return aColor;
  }
  //var cthRegEx = new RegExp('(.*?)rgb\((\d+), (\d+), (\d+)\)'); //WASN'T RETURNING WHAT I NEEDED CONSISTENTLY
  var cthRegEx = /rgb\((\d{1,3}), (\d{1,3}), (\d{1,3})\)/; //THIS ONE WORKS BETTER BUT RED IS IN DIGITS[1], NOT DIGITS[2]
  cthRegEx.lastIndex = 0;
  var aDigits = cthRegEx.exec(aColor);
  
  //DebugLog('red: '+aDigits[1]);
  //DebugLog('green: '+aDigits[2]);
  //DebugLog('blue: '+aDigits[3]);

  //var red = parseInt(aDigits[2]);
  //var green = parseInt(aDigits[3]);
  //var blue = parseInt(aDigits[4]);
  var red = parseInt(aDigits[1]);
  var green = parseInt(aDigits[2]);
  var blue = parseInt(aDigits[3]);
  
  var aRGB = blue | (green << 8) | (red << 16);
  //return aDigits[1] + '#' + aRGB.toString(16);
  return '#' + aRGB.toString(16);
};


//----------------------------------------------------------------------------
function colorNameToHex(acolor)
{
    var thecolors = {"aliceblue":"#f0f8ff","antiquewhite":"#faebd7","aqua":"#00ffff","aquamarine":"#7fffd4","azure":"#f0ffff",
    "beige":"#f5f5dc","bisque":"#ffe4c4","black":"#000000","blanchedalmond":"#ffebcd","blue":"#0000ff","blueviolet":"#8a2be2","brown":"#a52a2a","burlywood":"#deb887",
    "cadetblue":"#5f9ea0","chartreuse":"#7fff00","chocolate":"#d2691e","coral":"#ff7f50","cornflowerblue":"#6495ed","cornsilk":"#fff8dc","crimson":"#dc143c","cyan":"#00ffff",
    "darkblue":"#00008b","darkcyan":"#008b8b","darkgoldenrod":"#b8860b","darkgray":"#a9a9a9","darkgreen":"#006400","darkkhaki":"#bdb76b","darkmagenta":"#8b008b","darkolivegreen":"#556b2f",
    "darkorange":"#ff8c00","darkorchid":"#9932cc","darkred":"#8b0000","darksalmon":"#e9967a","darkseagreen":"#8fbc8f","darkslateblue":"#483d8b","darkslategray":"#2f4f4f","darkturquoise":"#00ced1",
    "darkviolet":"#9400d3","deeppink":"#ff1493","deepskyblue":"#00bfff","dimgray":"#696969","dodgerblue":"#1e90ff",
    "firebrick":"#b22222","floralwhite":"#fffaf0","forestgreen":"#228b22","fuchsia":"#ff00ff",
    "gainsboro":"#dcdcdc","ghostwhite":"#f8f8ff","gold":"#ffd700","goldenrod":"#daa520","gray":"#808080","green":"#008000","greenyellow":"#adff2f",
    "honeydew":"#f0fff0","hotpink":"#ff69b4",
    "indianred ":"#cd5c5c","indigo ":"#4b0082","ivory":"#fffff0","khaki":"#f0e68c",
    "lavender":"#e6e6fa","lavenderblush":"#fff0f5","lawngreen":"#7cfc00","lemonchiffon":"#fffacd","lightblue":"#add8e6","lightcoral":"#f08080","lightcyan":"#e0ffff","lightgoldenrodyellow":"#fafad2",
    "lightgrey":"#d3d3d3","lightgreen":"#90ee90","lightpink":"#ffb6c1","lightsalmon":"#ffa07a","lightseagreen":"#20b2aa","lightskyblue":"#87cefa","lightslategray":"#778899","lightsteelblue":"#b0c4de",
    "lightyellow":"#ffffe0","lime":"#00ff00","limegreen":"#32cd32","linen":"#faf0e6",
    "magenta":"#ff00ff","maroon":"#800000","mediumaquamarine":"#66cdaa","mediumblue":"#0000cd","mediumorchid":"#ba55d3","mediumpurple":"#9370d8","mediumseagreen":"#3cb371","mediumslateblue":"#7b68ee",
    "mediumspringgreen":"#00fa9a","mediumturquoise":"#48d1cc","mediumvioletred":"#c71585","midnightblue":"#191970","mintcream":"#f5fffa","mistyrose":"#ffe4e1","moccasin":"#ffe4b5",
    "navajowhite":"#ffdead","navy":"#000080",
    "oldlace":"#fdf5e6","olive":"#808000","olivedrab":"#6b8e23","orange":"#ffa500","orangered":"#ff4500","orchid":"#da70d6",
    "palegoldenrod":"#eee8aa","palegreen":"#98fb98","paleturquoise":"#afeeee","palevioletred":"#d87093","papayawhip":"#ffefd5","peachpuff":"#ffdab9","peru":"#cd853f","pink":"#ffc0cb","plum":"#dda0dd","powderblue":"#b0e0e6","purple":"#800080",
    "red":"#ff0000","rosybrown":"#bc8f8f","royalblue":"#4169e1",
    "saddlebrown":"#8b4513","salmon":"#fa8072","sandybrown":"#f4a460","seagreen":"#2e8b57","seashell":"#fff5ee","sienna":"#a0522d","silver":"#c0c0c0","skyblue":"#87ceeb","slateblue":"#6a5acd","slategray":"#708090","snow":"#fffafa","springgreen":"#00ff7f","steelblue":"#4682b4",
    "tan":"#d2b48c","teal":"#008080","thistle":"#d8bfd8","tomato":"#ff6347","turquoise":"#40e0d0",
    "violet":"#ee82ee",
    "wheat":"#f5deb3","white":"#ffffff","whitesmoke":"#f5f5f5",
    "yellow":"#ffff00","yellowgreen":"#9acd32"};

    if (typeof thecolors[acolor.toLowerCase()] != 'undefined')
    	return thecolors[acolor.toLowerCase()];

    return false;
}


//----------------------------------------------------------------------------
function getStyle(elem, name) {
  if (document.defaultView && document.defaultView.getComputedStyle) {
    name = name.replace(/([A-Z])/g, "-$1");
    name = name.toLowerCase();
    s = document.defaultView.getComputedStyle(elem, "");
    return s && s.getPropertyValue(name);
  } else if (elem.currentStyle) {
    if (/backgroundcolor/i.test(name)) {
      return (function (el) { // get a rgb based color on IE
        var oRG=document.body.createTextRange();
        oRG.moveToElementText(el);
        var iClr=oRG.queryCommandValue("BackColor");
          return "rgb("+(iClr & 0xFF)+","+((iClr & 0xFF00)>>8)+","+
                      ((iClr & 0xFF0000)>>16)+")";
      })(elem);
    }

    return elem.currentStyle[name];
  } else if (elem.style[name]) {
    return elem.style[name];
  } else  {
    return null;
  }
}


//----------------------------------------------------------------------------
//----------------------------------------------------------------------------
//----------------------------------------------------------------------------
//----------------------------------------------------------------------------
// info on mouse move, drag and drop, etc
// http://www.webreference.com/programming/javascript/mk/column2/index.html
var mousePos;
var absMousePos;
document.onmousemove = mouseMove; 

//----------------------------------------------------------------------------
function mouseMove(ev){ 
  ev           = ev || window.event; 
  mousePos = mouseCoords(ev); 
  absMousePos = absMouseCoords(ev); 
	//DebugLog('mouseMove - cur pos ['+mousePos.x+','+mousePos.y+'], abs ['+ev.clientX+','+ev.clientY+']');
}     

//----------------------------------------------------------------------------
function mouseCoords(ev){
	// from http://www.webreference.com/programming/javascript/mk/column2/
	if(ev.pageX || ev.pageY){
		return {x:ev.pageX, y:ev.pageY};
	}
	return {
		x:ev.clientX + document.body.scrollLeft - document.body.clientLeft,
		y:ev.clientY + document.body.scrollTop  - document.body.clientTop
	};
}

//----------------------------------------------------------------------------
function absMouseCoords(ev){
	if(ev.clientX || ev.clientY){
		return {x:ev.clientX, y:ev.clientY};
	}
	return {x:ev.clientX, y:ev.clientY};
}

//----------------------------------------------------------------------------
function isMouseInElement(anItemID){
var thebox = document.getElementById(anItemID);
var isInBox = false;
var rectOffset;

  if(thebox){
    rectOffset = getPageOffset(thebox);
    var BRx = rectOffset.left + thebox.clientWidth; 
    var BRy = rectOffset.top + thebox.clientHeight; 
    isInBox = isPointInRectangle(mousePos.x,mousePos.y,rectOffset.left,rectOffset.top,BRx,BRy);
    //DebugLog('isMouseInElement: item['+anItemID+'] - isIN['+isInBox+'] - mouse('+mousePos.x+','+mousePos.y+') - x: '+rectOffset.left+' to '+BRx+',  y: '+rectOffset.top+' to '+BRy);
  }
  
  return isInBox;
}

//----------------------------------------------------------------------------
function isMouseInAbsElement(anItemID){
var thebox = document.getElementById(anItemID);
var isInBox = false;
var rectOffset;

  if(thebox){
    rectOffset = getPageOffset(thebox);
    //var BRx = rectOffset.left + thebox.clientWidth; 
    //var BRy = rectOffset.top + thebox.clientHeight; 
    var BRx = rectOffset.left + thebox.offsetWidth; 
    var BRy = rectOffset.top + thebox.offsetHeight; 
    isInBox = isPointInRectangle(absMousePos.x,absMousePos.y,rectOffset.left,rectOffset.top,BRx,BRy);
    //DebugLog('isMouseInAbsElement: item['+anItemID+'] - isIN['+isInBox+'] - mouse('+absMousePos.x+','+absMousePos.y+') - x: '+rectOffset.left+' to '+BRx+',  y: '+rectOffset.top+' to '+BRy);
  }
  return isInBox;
}


//----------------------------------------------------------------------------
function isPointInRectangle(theX,theY,rectTLx,rectTLy,rectBRx,rectBRy){
var isIn = false;
  if(theX >= rectTLx  &&  theX <= rectBRx){
    if(theY >= rectTLy  &&  theY <= rectBRy){
      isIn = true;
    }
  }
return isIn;
}


//----------------------------------------------------------------------------
function enableDragable(aDivID){
	var theDiv = document.getElementById(aDivID);	
	DebugLog('enableDragable - div name['+aDivID+']');
	if(theDiv){
		dragElement(theDiv);
	}
}

//----------------------------------------------------------------------------
function dragElement(aElement) {
  var pos1 = 0;
	var pos2 = 0;
	var pos3 = 0
	var pos4 = 0;
	DebugLog('['+aElement.id+'] dragElement - start');
  if (document.getElementById(aElement.id + "header")) {
    document.getElementById(aElement.id + "header").onmousedown = dragStart;
  } else { 
    aElement.onmousedown = dragStart;
  }
	//----------------------------
  function dragStart(e) {
		// start
    e = e || window.event;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
		aElement.didStartDrag = true;
    document.onmouseup = dragDone;
    document.onmousemove = dragMove;
  }
	//----------------------------
  function dragDone() {
    // finish
    document.onmouseup = null;
    document.onmousemove = null;
  }
	//----------------------------
  function dragMove(e) {
		// move
    e = e || window.event;
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    aElement.style.top = (aElement.offsetTop - pos2) + "px";
    aElement.style.left = (aElement.offsetLeft - pos1) + "px";
  }

}


//----------------------------------------------------------------------------
//var xmlhttp = GetXmlHttpObject(); //SETUP FOR THE POSTBACK PROCESSING
//
//xmlhttp.onreadystatechange=function()
//{
//  if (xmlhttp.readyState==4 && xmlhttp.status==200)
//  {
//    //UPDATE ANSWER
//    document.getElementById("myDiv").innerHTML=xmlhttp.responseText; 
//  }
//}
// USAGE:
//  xmlhttp.open('GET','doProcess.asp?ACT=1&UI='+aUI+'&QN='+aQuestionNum+'&OV='+aValueNum+'&CT='+rstr,true);
//  xmlhttp.send();

function GetXmlHttpObject() {
  var xmlHttp = null;
  try {
      // IE7+, Firefox, Opera 8.0+, Safari
      DebugLog("before XMLHttpRequest create");
      xmlHttp = new XMLHttpRequest();
      //xmlHttp = new ServerXMLHttpRequest();
      
      //response.Expires = 0
      //response.ExpiresAbsolute = Now() - 1
      //response.addHeader "pragma","no-cache"
      //response.addHeader "cache-control","private"
      //Response.CacheControl = "no-cache"
      DebugLog("after XMLHttpRequest create");
      //if(xmlHttp){
      //  DebugLog("inside XMLHttpRequest test ");
        //xmlHttp.setRequestHeader("Expires", 0);
        //xmlHttp.setRequestHeader "pragma", "no-cache";
        //xmlHttp.setRequestHeader "cache-control", "private";
        //xmlHttp.setRequestHeader "CacheControl", "no-cache";
      //  DebugLog("after XMLHttpRequest headers set ");
      //}
  }
  catch (e) {
      // Internet Explorer
      try {
          DebugLog("before ActiveXObject(Msxml2.XMLHTTP) create");
          //xmlHttp = new ActiveXObject("Msxml2.XMLHTTP");
          xmlHttp = new ActiveXObject("Msxml2.ServerXMLHTTP");
          DebugLog("after ActiveXObject(Msxml2.XMLHTTP) create");
          //if(xmlHttp){
            //xmlHttp.setRequestHeader "Expires", "0";
            //xmlHttp.setRequestHeader "pragma", "no-cache";
            //xmlHttp.setRequestHeader "cache-control", "private";
            //xmlHttp.setRequestHeader "CacheControl", "no-cache";
          //}
      }
      catch (e) {
          DebugLog("before ActiveXObject(Microsoft.XMLHTTP) create");
          xmlHttp = new ActiveXObject("Microsoft.XMLHTTP");
          DebugLog("after ActiveXObject(Microsoft.XMLHTTP) create");
      }
  }


  return xmlHttp;
}



//----------------------------------------------------------------------------
function ClearIFrame(iFrameID) {

  gCleariFrameID = iFrameID
  ClearIFrameAux(); //USE THIS HELPER FUNCTION FOR THE TIMEOUT

}



//----------------------------------------------------------------------------
function ClearIFrameAux() {
var theiframe = document.getElementById(gCleariFrameID); //USE THE GLOBAL TO ID THE IFRAME IN THE SETTIMEOUT CALLBACK

  if( theiframe.document ) {
    if( theiframe.document.body ) {
      theiframe.document.body.innerHTML = ''; //Chrome, IE
    }
    else {
      setTimeout('ClearIFrame("'+ iFrameID +'")',100);
    }
  }
  else {
    if( theiframe.contentDocument.body ){
      theiframe.contentDocument.body.innerHTML = ''; //FireFox
    }
    else {
      setTimeout('ClearIFrame("'+ iFrameID +'")',100);
    }
  }

}




//-----------------------------------------------------------------------------------------------------------
//fgnass.github.com/spin.js#v1.2.5  :  http://fgnass.github.com/spin.js/
(function(window, document, undefined) {

/**
 * Copyright (c) 2011 Felix Gnass [fgnass at neteye dot de]
 * Licensed under the MIT license
 */

  var prefixes = ['webkit', 'Moz', 'ms', 'O']; /* Vendor prefixes */
  var animations = {}; /* Animation rules keyed by their name */
  var useCssAnimations;

  /**
   * Utility function to create elements. If no tag name is given,
   * a DIV is created. Optionally properties can be passed.
   */
  function createEl(tag, prop) {
    var el = document.createElement(tag || 'div');
    var n;

    for(n in prop) {
      el[n] = prop[n];
    }
    return el;
  }

  /**
   * Appends children and returns the parent.
   */
  function ins(parent /* child1, child2, ...*/) {
    for (var i=1, n=arguments.length; i<n; i++) {
      parent.appendChild(arguments[i]);
    }
    return parent;
  }

  /**
   * Insert a new stylesheet to hold the @keyframe or VML rules.
   */
  var sheet = function() {
    var el = createEl('style');
    ins(document.getElementsByTagName('head')[0], el);
    return el.sheet || el.styleSheet;
  }();

  /**
   * Creates an opacity keyframe animation rule and returns its name.
   * Since most mobile Webkits have timing issues with animation-delay,
   * we create separate rules for each line/segment.
   */
  function addAnimation(alpha, trail, i, lines) {
    var name = ['opacity', trail, ~~(alpha*100), i, lines].join('-');
    var start = 0.01 + i/lines*100;
    var z = Math.max(1-(1-alpha)/trail*(100-start) , alpha);
    var prefix = useCssAnimations.substring(0, useCssAnimations.indexOf('Animation')).toLowerCase();
    var pre = prefix && '-'+prefix+'-' || '';

    if (!animations[name]) {
      sheet.insertRule(
        '@' + pre + 'keyframes ' + name + '{' +
        '0%{opacity:'+z+'}' +
        start + '%{opacity:'+ alpha + '}' +
        (start+0.01) + '%{opacity:1}' +
        (start+trail)%100 + '%{opacity:'+ alpha + '}' +
        '100%{opacity:'+ z + '}' +
        '}', 0);
      animations[name] = 1;
    }
    return name;
  }

  /**
   * Tries various vendor prefixes and returns the first supported property.
   **/
  function vendor(el, prop) {
    var s = el.style;
    var pp;
    var i;

    if(s[prop] !== undefined) return prop;
    prop = prop.charAt(0).toUpperCase() + prop.slice(1);
    for(i=0; i<prefixes.length; i++) {
      pp = prefixes[i]+prop;
      if(s[pp] !== undefined) return pp;
    }
  }

  /**
   * Sets multiple style properties at once.
   */
  function css(el, prop) {
    for (var n in prop) {
      el.style[vendor(el, n)||n] = prop[n];
    }
    return el;
  }

  /**
   * Fills in default values.
   */
  function merge(obj) {
    for (var i=1; i < arguments.length; i++) {
      var def = arguments[i];
      for (var n in def) {
        if (obj[n] === undefined) obj[n] = def[n];
      }
    }
    return obj;
  }

  /**
   * Returns the absolute page-offset of the given element.
   */
  function pos(el) {
    var o = {x:el.offsetLeft, y:el.offsetTop};
    while((el = el.offsetParent)) {
      o.x+=el.offsetLeft;
      o.y+=el.offsetTop;
    }
    return o;
  }

  var defaults = {
    lines: 12,            // The number of lines to draw
    length: 7,            // The length of each line
    width: 5,             // The line thickness
    radius: 10,           // The radius of the inner circle
    rotate: 0,            // rotation offset
    color: '#000',        // #rgb or #rrggbb
    speed: 1,             // Rounds per second
    trail: 100,           // Afterglow percentage
    opacity: 1/4,         // Opacity of the lines
    fps: 20,              // Frames per second when using setTimeout()
    zIndex: 2e9,          // Use a high z-index by default
    className: 'spinner', // CSS class to assign to the element
    top: 'auto',          // center vertically
    left: 'auto'          // center horizontally
  };

  /** The constructor */
  var Spinner = function Spinner(o) {
    if (!this.spin) return new Spinner(o);
    this.opts = merge(o || {}, Spinner.defaults, defaults);
  };

  Spinner.defaults = {};
  merge(Spinner.prototype, {
    spin: function(target) {
      this.stop();
      var self = this;
      var o = self.opts;
      var el = self.el = css(createEl(0, {className: o.className}), {position: 'relative', zIndex: o.zIndex});
      var mid = o.radius+o.length+o.width;
      var ep; // element position
      var tp; // target position

      if (target) {
        target.insertBefore(el, target.firstChild||null);
        tp = pos(target);
        ep = pos(el);
        css(el, {
          left: (o.left == 'auto' ? tp.x-ep.x + (target.offsetWidth >> 1) : o.left+mid) + 'px',
          top: (o.top == 'auto' ? tp.y-ep.y + (target.offsetHeight >> 1) : o.top+mid)  + 'px'
        });
      }

      el.setAttribute('aria-role', 'progressbar');
      self.lines(el, self.opts);

      if (!useCssAnimations) {
        // No CSS animation support, use setTimeout() instead
        var i = 0;
        var fps = o.fps;
        var f = fps/o.speed;
        var ostep = (1-o.opacity)/(f*o.trail / 100);
        var astep = f/o.lines;

        !function anim() {
          i++;
          for (var s=o.lines; s; s--) {
            var alpha = Math.max(1-(i+s*astep)%f * ostep, o.opacity);
            self.opacity(el, o.lines-s, alpha, o);
          }
          self.timeout = self.el && setTimeout(anim, ~~(1000/fps));
        }();
      }
      return self;
    },
    stop: function() {
      var el = this.el;
      if (el) {
        clearTimeout(this.timeout);
        if (el.parentNode) el.parentNode.removeChild(el);
        this.el = undefined;
      }
      return this;
    },
    lines: function(el, o) {
      var i = 0;
      var seg;

      function fill(color, shadow) {
        return css(createEl(), {
          position: 'absolute',
          width: (o.length+o.width) + 'px',
          height: o.width + 'px',
          background: color,
          boxShadow: shadow,
          transformOrigin: 'left',
          transform: 'rotate(' + ~~(360/o.lines*i+o.rotate) + 'deg) translate(' + o.radius+'px' +',0)',
          borderRadius: (o.width>>1) + 'px'
        });
      }
      for (; i < o.lines; i++) {
        seg = css(createEl(), {
          position: 'absolute',
          top: 1+~(o.width/2) + 'px',
          transform: o.hwaccel ? 'translate3d(0,0,0)' : '',
          opacity: o.opacity,
          animation: useCssAnimations && addAnimation(o.opacity, o.trail, i, o.lines) + ' ' + 1/o.speed + 's linear infinite'
        });
        if (o.shadow) ins(seg, css(fill('#000', '0 0 4px ' + '#000'), {top: 2+'px'}));
        ins(el, ins(seg, fill(o.color, '0 0 1px rgba(0,0,0,.1)')));
      }
      return el;
    },
    opacity: function(el, i, val) {
      if (i < el.childNodes.length) el.childNodes[i].style.opacity = val;
    }
  });

  /////////////////////////////////////////////////////////////////////////
  // VML rendering for IE
  /////////////////////////////////////////////////////////////////////////

  /**
   * Check and init VML support
   */
  !function() {

    function vml(tag, attr) {
      return createEl('<' + tag + ' xmlns="urn:schemas-microsoft.com:vml" class="spin-vml">', attr);
    }

    var s = css(createEl('group'), {behavior: 'url(#default#VML)'});

    if (!vendor(s, 'transform') && s.adj) {

      // VML support detected. Insert CSS rule ...
      sheet.addRule('.spin-vml', 'behavior:url(#default#VML)');

      Spinner.prototype.lines = function(el, o) {
        var r = o.length+o.width;
        var s = 2*r;

        function grp() {
          return css(vml('group', {coordsize: s +' '+s, coordorigin: -r +' '+-r}), {width: s, height: s});
        }

        var margin = -(o.width+o.length)*2+'px';
        var g = css(grp(), {position: 'absolute', top: margin, left: margin});

        var i;

        function seg(i, dx, filter) {
          ins(g,
            ins(css(grp(), {rotation: 360 / o.lines * i + 'deg', left: ~~dx}),
              ins(css(vml('roundrect', {arcsize: 1}), {
                  width: r,
                  height: o.width,
                  left: o.radius,
                  top: -o.width>>1,
                  filter: filter
                }),
                vml('fill', {color: o.color, opacity: o.opacity}),
                vml('stroke', {opacity: 0}) // transparent stroke to fix color bleeding upon opacity change
              )
            )
          );
        }

        if (o.shadow) {
          for (i = 1; i <= o.lines; i++) {
            seg(i, -2, 'progid:DXImageTransform.Microsoft.Blur(pixelradius=2,makeshadow=1,shadowopacity=.3)');
          }
        }
        for (i = 1; i <= o.lines; i++) seg(i);
        return ins(el, g);
      };
      Spinner.prototype.opacity = function(el, i, val, o) {
        var c = el.firstChild;
        o = o.shadow && o.lines || 0;
        if (c && i+o < c.childNodes.length) {
          c = c.childNodes[i+o]; c = c && c.firstChild; c = c && c.firstChild;
          if (c) c.opacity = val;
        }
      };
    }
    else {
      useCssAnimations = vendor(s, 'animation');
    }
  }();

  window.Spinner = Spinner;

})(window, document);


//-----------------------------------------------------------------------------------------------------------
function getCurrentURLParameter(param)
{
return getURLParameter(window.location.href, param);
}

//-----------------------------------------------------------------------------------------------------------
function getURLParameter(url, param)
{
	var newAdditionalURL = "";
	var tempArray = url.split("?");
	var baseURL = tempArray[0];
	var additionalURL = tempArray[1];
	var temp = "";
	var paramValue = "";
	
	if (additionalURL) 
	{
		tempArray = additionalURL.split("&");
		for (i=0; i<tempArray.length; i++)
		{
			if(tempArray[i].split('=')[0] == param)
			{
				paramValue = tempArray[i].split('=')[1];
			}
		}        
	}
	else
	{
		paramValue = "";
	}
	DebugLog('getURLParameter - param['+param+'], value['+paramValue+'], url['+url+']');
  return paramValue
}

//-----------------------------------------------------------------------------------------------------------
function updateURLParameter(url, param, paramVal)
{
    var TheAnchor = null;
    var newAdditionalURL = "";
    var tempArray = url.split("?");
    var baseURL = tempArray[0];
    var additionalURL = tempArray[1];
    var temp = "";

    if (additionalURL) 
    {
        var tmpAnchor = additionalURL.split("#");
        var TheParams = tmpAnchor[0];
            TheAnchor = tmpAnchor[1];
        if(TheAnchor)
            additionalURL = TheParams;

        tempArray = additionalURL.split("&");

        for (i=0; i<tempArray.length; i++)
        {
            if(tempArray[i].split('=')[0] != param)
            {
                newAdditionalURL += temp + tempArray[i];
                temp = "&";
            }
        }        
    }
    else
    {
        var tmpAnchor = baseURL.split("#");
        var TheParams = tmpAnchor[0];
            TheAnchor  = tmpAnchor[1];

        if(TheParams)
            baseURL = TheParams;
    }

    if(TheAnchor)
        paramVal += "#" + TheAnchor;
		
		if(!(paramVal === '')){
			var rows_txt = temp + "" + param + "=" + paramVal;
		}else{
			var rows_txt = "";
		}
    return baseURL + "?" + newAdditionalURL + rows_txt;
}