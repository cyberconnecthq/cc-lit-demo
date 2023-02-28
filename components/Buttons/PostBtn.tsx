import React, { useEffect } from "react";
import { useContext } from "react";
import { TailSpin } from "react-loading-icons";
import { useLazyQuery, useMutation, useQuery } from "@apollo/client";
import {
  pinFileToIPFS,
  pinJSONToIPFS,
  getEssenceSVGData,
} from "../../helpers/functions";
import { CREATE_REGISTER_ESSENCE_TYPED_DATA, RELAY } from "../../graphql";
import { IEssenceMetadata, IPostInput } from "../../types";
import { randPhrase } from "@ngneat/falso";
import { AuthContext } from "../../context/auth";
import { ModalContext } from "../../context/modal";
import { v4 as uuidv4 } from "uuid";
// @ts-ignore
import LitJsSdk from "@lit-protocol/sdk-browser";
import { RELAY_ACTION_STATUS } from "@/graphql/RelayActionStatus";
import { pollRelayActionStatus } from "@/helpers/functions";

function PostBtn({
  nftImageURL,
  content,
  middleware,
  title,
  description,
}: IPostInput) {
  const {
    address,
    accessToken,
    primaryProfile,
    indexingPosts,
    setIndexingPosts,
    connectWallet,
    checkNetwork,
  } = useContext(AuthContext);
  const [loading, setLoading] = React.useState(false);
  const { handleModal } = useContext(ModalContext);
  const [createRegisterEssenceTypedData] = useMutation(
    CREATE_REGISTER_ESSENCE_TYPED_DATA
  );
  // const [getRelayActionStatus] = useQuery(RELAY_ACTION_STATUS)
  const [relay] = useMutation(RELAY);
  const [relayActionId, setRelayActionId] = React.useState("");

  const encryptWithLit = async (data: any) => {
    const client = new LitJsSdk.LitNodeClient();
    await client.connect();
    const chain = "bscTestnet";

    
    const unifiedAccessControlConditions = [
      {
        conditionType: "evmBasic",
        contractAddress: "",
        standardContractType: "",
        chain,
        method: "",
        parameters: [":userAddress"],
        returnValueTest: {
          comparator: "=",
          value: address,
        },
      }
      // ,
      // { operator: "or" },
      // {
      //   conditionType: "evmContract",
      //   permanent: false,
      //   contractAddress: "0x0561d367868B2d8E405B1241Ba568C40aB8fD2c8",
      //   functionName: "isSubscribedByMe",
      //   functionParams: [String(primaryProfile?.profileID), ":userAddress"],
      //   functionAbi: {
      //     inputs: [
      //       {
      //         internalType: "uint256",
      //         name: "profileId",
      //         type: "uint256",
      //       },
      //       {
      //         internalType: "address",
      //         name: "me",
      //         type: "address",
      //       },
      //     ],
      //     name: "isSubscribedByMe",
      //     outputs: [
      //       {
      //         internalType: "bool",
      //         name: "",
      //         type: "bool",
      //       },
      //     ],
      //     stateMutability: "view",
      //     type: "function",
      //   },
      //   chain: chain,
      //   returnValueTest: {
      //     key: "",
      //     comparator: "=",
      //     value: "true",
      //   },
      // },
    ];

    const authSig = await LitJsSdk.checkAndSignAuthMessage({
      chain: chain,
    });
    const { encryptedString, symmetricKey } = await LitJsSdk.encryptString(
      data
    );

    const encryptedSymmetricKey = await client.saveEncryptionKey({
      unifiedAccessControlConditions,
      symmetricKey,
      authSig,
      chain: chain,
    });

    return {
      encryptedString,
      encryptedSymmetricKey: LitJsSdk.uint8arrayToString(
        encryptedSymmetricKey,
        "base16"
      ),
    };
  };
  
  const post = async (id: string) => {
    console.log("start polling");
    const res = await pollRelayActionStatus(id);
    console.log("res", res)
    if (res.txHash) {
      console.log("txHash", res.txHash);
      handleModal("success", `Your post was successfully relayed https://testnet.bscscan.com/tx/${res.txHash}}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log("peroidic polling end");
    await post(id);
  };

  const handleOnClick = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    try {
      /* Check if the user logged in */
      if (!accessToken) {
        throw Error("You need to Sign in.");
      }

      /* Check if the has signed up */
      if (!primaryProfile?.profileID) {
        throw Error("Youn need to Sign up.");
      }
      console.log("content", content)
      const encryptedContent = await encryptWithLit(content);
      /* Connect wallet and get provider */
      const provider = await connectWallet();

      /* Check if the network is the correct one */
      await checkNetwork(provider);

      /* Function to render the svg data for the NFT */
      /* (default if the user doesn't pass a image url) */
      const svg_data = getEssenceSVGData();

      const contentHash = await pinFileToIPFS(encryptedContent.encryptedString);

      /* Construct the metadata object for the Essence NFT */
      const metadata: IEssenceMetadata = {
        metadata_id: uuidv4(),
        version: "1.0.0",
        app_id: "cyberconnect",
        lang: "en",
        issue_date: new Date().toISOString(),
        content:
          JSON.stringify({
            contentHash: contentHash,
            encryptedSymmetricKey: encryptedContent.encryptedSymmetricKey,
          }) || randPhrase(),
        media: [],
        tags: ["lit-v1.2"],
        image: nftImageURL ? nftImageURL : "",
        image_data: !nftImageURL ? svg_data : "",
        name: title,
        description: description,
        animation_url: "",
        external_url: "",
        attributes: [],
      };

      /* Upload metadata to IPFS */
      const ipfsHash = await pinJSONToIPFS(metadata);

      /* Get the signer from the provider */
      const signer = provider.getSigner();

      /* Get the address from the provider */
      const address = await signer.getAddress();

      /* Get the network from the provider */
      const network = await provider.getNetwork();

      /* Get the chain id from the network */
      const chainID = network.chainId;

      /* Create typed data in a readable format */
      const typedDataResult = await createRegisterEssenceTypedData({
        variables: {
          input: {
            options: {},
            /* The profile id under which the Essence is registered */
            profileID: primaryProfile?.profileID,
            /* Name of the Essence */
            name: "Post",
            /* Symbol of the Essence */
            symbol: "POST",
            /* URL for the json object containing data about content and the Essence NFT */
            tokenURI: `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
            /* Middleware that allows users to collect the Essence NFT for free */
            middleware:
              middleware === "free"
                ? { collectFree: true }
                : {
                    collectPaid: {
                      /* Address that will receive the amount */
                      recipient: address,
                      /* Number of times the Essence can be collected */
                      totalSupply: 1000,
                      /* Amount that needs to be paid to collect essence */
                      amount: 1,
                      /* The currency for the  amount. Chainlink token contract on bscTestnet */
                      currency: "0x326C977E6efc84E512bB9C30f76E30c160eD06FB",
                      /* If it require that the collector is also subscribed */
                      subscribeRequired: false,
                    },
                  },
            /* Set if the Essence should be transferable or not */
            transferable: true,
          },
        },
      });

      const typedData =
        typedDataResult.data?.createRegisterEssenceTypedData?.typedData;
      const message = typedData.data;
      const typedDataID = typedData.id;

      /* Get the signature for the message signed with the wallet */
      const fromAddress = await signer.getAddress();
      const params = [fromAddress, message];
      const method = "eth_signTypedData_v4";
      const signature = await signer.provider.send(method, params);

      /* Call the relay to broadcast the transaction */
      const relayResult = await relay({
        variables: {
          input: {
            typedDataID: typedDataID,
            signature: signature,
          },
        },
      });
      const relayActionId = relayResult.data.relay.relayActionId;
      console.log("relayActionId", relayActionId);
      setRelayActionId(relayActionId);
      /* Close Post Modal */
			handleModal(null, "");

			const relayingPost = {
				createdBy: {
					handle: primaryProfile?.handle,
					avatar: primaryProfile?.avatar,
					metadata: primaryProfile?.metadata,
					profileID: primaryProfile?.profileID,
				},
				essenceID: 0, // Value will be updated once it's indexed
				tokenURI: `https://cyberconnect.mypinata.cloud/ipfs/${ipfsHash}`,
				isIndexed: false,
				isCollectedByMe: false,
				collectMw: undefined,
				relayActionId: relayActionId,
			};
      console.log("relayingPost", relayingPost);
      localStorage.setItem(
				"relayingPosts",
				JSON.stringify([...indexingPosts, relayingPost])
			);
      post(relayActionId)

      /* Display success message */
      handleModal("info", "Your post is being relayed...");
    } catch (error) {
      /* Set the indexingPosts in the state variables */
      setIndexingPosts([...indexingPosts]);

      /* Display error message */
      const message = error.message as string;
      handleModal("error", message);
      setLoading(false);
    }
    setLoading(false);
  };

  return (
    <button
      className="post-btn flex items-center justify-center"
      onClick={handleOnClick}
    >
      {loading && (
        <TailSpin stroke="#fff" height={20} className="m-0" strokeWidth={2} />
      )}
      Post
    </button>
  );
}

export default PostBtn;
