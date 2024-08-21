import axios from 'axios';
import sdk, {
    DeviceProvider,
    ScryptedDeviceBase,
    ScryptedInterface,
    ScryptedDeviceType,
    HumiditySensor,
    ScryptedNativeId,
    Settings,
    Setting,
    SettingValue
} from '@scrypted/sdk';

class EcowittSoilMoistureSensor extends ScryptedDeviceBase implements HumiditySensor {
    constructor(private plugin: EcowittSoilMoisturePlugin, nativeId?: string) {
        super(nativeId);
        this.humidity = this.humidity || 0
    }

    release() {
        this.console.log(`Releasing device ${this.nativeId}`);
    }
}

class EcowittSoilMoisturePlugin extends ScryptedDeviceBase implements DeviceProvider, Settings {
    private pollInterval: NodeJS.Timer | undefined;

    constructor(nativeId?: string) {
        super(nativeId);

        this.console.log("Ecowitt Soil Moisture Plugin Loaded")
        this.prepareDevices();
        this.startPolling();
    } 

    getEcowittHost() {
        return this.storage.getItem("ecowitt-host")
    }

    async getSettings(): Promise<Setting[]> {
        return [
            {
              key: "ecowitt-host",
              title: "Ecowitt Gateway Hostname",
              value: this.getEcowittHost(),
              description:
                "The hostname or IP address of your Ecowitt Gateway. Example http://192.168.0.137",
            }
        ]
    }

    async putSetting(key: string, value: SettingValue): Promise<void> {
        value ? this.storage.setItem(key, value.toString()) : this.console.log(`Failed to update ${key}, value is undefined`);
        this.onDeviceEvent(ScryptedInterface.Settings, undefined);
        
        // If the user updated the ecowitt host, get a list of devices for the host
        if (key === "ecowitt-host") {
            this.prepareDevices();
        }
    }
    
    startPolling() {
        this.pollInterval = setInterval(() => this.pollData(), 60000);
    }

    async pollData() {
        try {
            this.console.log(`Polling data for Ecowitt Soil Moisture Sensors`);
            const devices = await this.getDeviceInfo();
            if (!devices) {
                this.console.log(`No devices configured.`);
                return;
            }
            
            devices.forEach(async deviceData => {
                const device = await this.getDevice(deviceData.nativeId);
                if (!device) {
                    this.console.log(`Failed to find device for ${deviceData.nativeId}`);
                }

                if (device.humidity != deviceData.humidity) {
                    device.humidity = deviceData.humidity;
                    this.console.log(`Updated ${device.name}'s humidity level to ${device.humidity}`);    
                }         
            });            
        } catch {
            this.console.log(`Error while polling data for Ecowitt devices.`);
        }
    }
    
    async prepareDevices() {
        this.console.log("Preparing to get a list of Ecowitt devices");

        // Get a list of devices from the Ecowitt Gateway
        const devices = await this.getDeviceInfo();

        if (devices) {
            await sdk.deviceManager.onDevicesChanged({
                devices: devices
            });
        }
    }

    async getDeviceInfo() {
        try {
            if (!this.getEcowittHost()) {
                this.console.log("Please specify your Ecowitt hostname or IP address to continue.");
                return undefined;
            }

            const gatewayUrl = this.getEcowittHost() + '/get_livedata_info';
            
            const response = await axios.get(gatewayUrl);
            
            const sensorData: any = response.data;            
            const devices = [];
            
            // Process soil moisture sensors
            for (const sensor of sensorData.ch_soil) {
                devices.push({
                    nativeId: `soil_${sensor.channel}`,
                    name: sensor.name,
                    humidity: this.parsePercentage(sensor.humidity),
                    type: ScryptedDeviceType.Sensor,
                    interfaces: [
                        ScryptedInterface.HumiditySensor
                    ]
                });
            }
            
            // You can add processing for other sensor types here if needed
            
            return devices;
        } catch (error) {
            this.console.error('Error querying gateway for devices:', error);
            throw error;
        }
    }

    private parsePercentage(value: string): number {
        // Remove any non-numeric characters except the decimal point
        const numericString = value.replace(/[^\d.]/g, '');
        // Parse the resulting string as a float and round to nearest integer
        return Math.round(parseFloat(numericString));
    }

    async fetchDataFromGateway(nativeId?: string) {
        
    }

    async getDevice(nativeId: ScryptedNativeId): Promise<any> {
        if (nativeId === undefined) {
            this.console.log("Attempted to get a device with an undefined nativeId");
            return undefined;
        } else {
            return new EcowittSoilMoistureSensor(this, nativeId);
        }
    }

    async releaseDevice(id: string, nativeId: ScryptedNativeId): Promise<void> {
        this.console.log(`Device removed ${nativeId}`);
    }
    
}

export default EcowittSoilMoisturePlugin;